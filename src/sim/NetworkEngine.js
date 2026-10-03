import { sameSubnet } from './ip.js';
import { BROADCAST_IP, DHCP_CLIENT_KINDS, DHCP_SERVER_KINDS } from './Packet.js';
import { Trace, TraceNode } from './Trace.js';
import { matchesService } from './services.js';

// Latencias aproximadas (ms). Solo sirven para que los tiempos de ping sean creíbles.
const LATENCY = { link: 0.05, switch: 0.02, router: 0.15, host: 0.05, internet: 5.5 };

// TTL inicial típico de cada sistema (Windows 128, equipos de red 255, Siemens S7 30)
const INITIAL_TTL = { pc: 128, laptop: 128, server: 128, industrial: 30, switch: 255, firewall: 255, cloud: 128 };

const ROLES = { switch: 'switch', firewall: 'router', cloud: 'cloud' };

// Servicios que escuchan en un puerto: si están detenidos, lo que llega se pierde
const SERVICE_PORTS = {
  dns: { service: 'DNS', port: 'UDP 53', kinds: new Set(['query']) },
  dhcp: { service: 'DHCP', port: 'UDP 67', kinds: DHCP_CLIENT_KINDS },
};

export const runs = (device, service) => device.services.get(service) === true;

// Motor de red: dado un paquete y el equipo que lo emite, calcula por dónde
// viaja y qué le pasa en cada equipo. Es síncrono y no sabe nada de la parte visual;
// la animación reproduce después la traza que devuelve trace().
//
// Simplificaciones deliberadas:
//  - Las tablas MAC de los switches se consideran ya aprendidas.
//  - Solo los hosts hacen ARP de forma visible; routers y respuestas usan MACs ya conocidas.
export class NetworkEngine {
  constructor(topology) {
    this.topology = topology;
    this.links = topology.links;
    this.reset();
  }

  // Vuelve al estado inicial de la topología: equipos encendidos, cachés y sesiones vacías
  reset() {
    this.devices = new Map(this.topology.devices.map((d) => [d.id, createDeviceState(d, this.topology.links)]));

    // Los equipos configurados por DHCP ya tienen concesión al arrancar la simulación
    const server = [...this.devices.values()].find((d) => d.services.has('DHCP'));
    if (!server) return;
    for (const device of this.devices.values()) {
      if (device.config.addressing !== 'dhcp') continue;
      server.leases.set(device.config.mac, { ip: device.config.ip, hostname: device.name, active: true });
      device.ifaces[0].dhcpServer = server.ifaces[0].ip;
    }
  }

  device(id) {
    const device = this.devices.get(id);
    if (!device) throw new Error(`Dispositivo desconocido: ${id}`);
    return device;
  }

  // Quién tiene una IP: una interfaz de la LAN o un host de Internet (que "vive" en la nube)
  locate(ip) {
    for (const device of this.devices.values()) {
      const iface = device.ifaces.find((i) => i.ip === ip);
      if (iface) return { device, iface };
      const host = device.hosts.find((h) => h.ip === ip);
      if (host) return { device, iface: device.ifaces[0], host };
    }
    return null;
  }

  initialTtl(deviceId) {
    const device = this.device(deviceId);
    // Desde Internet ya llega con los saltos de los routers del ISP descontados
    return (INITIAL_TTL[device.type] ?? 64) - device.route.length;
  }

  // Siguiente salto IP desde un host: el propio destino si está en su subred, si no la puerta de enlace
  nextHopIp(deviceId, dstIp) {
    const iface = this.device(deviceId).ifaces[0];
    if (!iface?.ip) return null;
    return sameSubnet(iface.ip, dstIp, iface.prefix) ? dstIp : (iface.gateway ?? null);
  }

  setServiceRunning(deviceId, service, running) {
    const device = this.device(deviceId);
    if (device.services.has(service)) device.services.set(service, running);
  }

  setPolicyEnabled(deviceId, policyId, enabled) {
    const policy = this.device(deviceId).policies.find((p) => p.id === policyId);
    if (policy) policy.enabled = enabled;
  }

  trace(packet, fromId) {
    const origin = this.device(fromId);
    const root = new TraceNode(fromId, null, packet, 0);
    if (!origin.up) return new Trace(root.end('dropped', 'Equipo apagado'));

    const iface = this.#egressInterface(origin, packet);
    if (!iface) return new Trace(root.end('unreachable', 'Sin ruta'));

    // Lo que sale de Internet ya ha atravesado los routers del ISP
    if (origin.role === 'cloud') root.addLatency(LATENCY.internet);

    let frame = packet;
    if (!frame.dstMac) {
      const mac = this.#nextHopMac(origin, iface, frame.dstIp);
      if (!mac) return new Trace(root.end('unreachable', 'Siguiente salto desconocido'));
      frame = frame.with({ srcMac: iface.mac, dstMac: mac });
    }
    this.#send(root, frame, origin, iface);
    return new Trace(root);
  }

  // ---------- Envío ----------

  #send(node, frame, device, iface) {
    // El switch emite desde su interfaz de gestión (SVI), que no está ligada a un puerto físico
    if (device.role === 'switch') return this.#switchFrame(node, frame, device, null, iface.vlan);

    const link = this.#linkOf(device.id, iface.port);
    if (!link) return node.end('dropped', 'Cable desconectado');
    this.#cross(node, frame, device.id, link, iface.vlan ?? null);
  }

  // La trama atraviesa un cable y llega al equipo del otro extremo
  #cross(node, frame, fromId, link, vlan) {
    // En un puerto de acceso manda la VLAN del puerto, no la que crea tener el equipo
    const frameVlan = link.mode === 'access' ? link.vlan : vlan;
    const peer = otherEnd(link, fromId);
    const hop = { link: link.id, from: fromId, to: peer.device, vlan: frameVlan, tagged: link.mode === 'trunk' };
    const child = node.addHop(hop, frame, LATENCY.link);
    this.#receive(child, frame, this.device(peer.device), link, peer.port, frameVlan);
  }

  #receive(node, frame, device, link, port, vlan) {
    if (!device.up) return node.end('dropped', 'Equipo apagado');
    switch (device.role) {
      case 'switch':
        return this.#switchFrame(node, frame, device, link, vlan);
      case 'router':
        return this.#routerFrame(node, frame, device, port, vlan);
      case 'cloud':
        return this.#cloudFrame(node, frame, device);
      default:
        return this.#hostFrame(node, frame, device);
    }
  }

  // ---------- Capa 2 ----------

  #switchFrame(node, frame, sw, ingress, vlan) {
    node.addLatency(LATENCY.switch);

    // El propio switch también es un host en su VLAN de gestión
    const mgmt = sw.ifaces.find((i) => i.vlan === vlan);
    if (ingress && mgmt && accepts(sw, mgmt, frame)) {
      node.end('delivered');
      if (!frame.isBroadcast) return;
    }

    const candidates = this.links.filter((l) => l !== ingress && touches(l, sw.id) && carries(l, vlan));
    let egress = frame.isBroadcast ? candidates : candidates.filter((l) => this.#leadsTo(l, sw.id, frame.dstMac, vlan));
    // Unicast desconocido: el switch lo inunda por toda la VLAN, igual que un broadcast
    if (!egress.length && !frame.isBroadcast) egress = candidates;

    if (!egress.length && !node.outcome) return node.end('discarded', `Sin más puertos en la VLAN ${vlan}`);
    for (const link of egress) this.#cross(node, frame, sw.id, link, vlan);
  }

  // ¿Se llega a esa MAC saliendo por este enlace? (equivale a consultar la tabla MAC)
  #leadsTo(link, fromId, mac, vlan, seen = new Set()) {
    const peer = this.device(otherEnd(link, fromId).device);
    if (peer.ifaces.some((i) => i.mac === mac)) return true;
    if (peer.role !== 'switch' || seen.has(peer.id)) return false;
    seen.add(peer.id);
    return this.links.some(
      (l) => l !== link && touches(l, peer.id) && carries(l, vlan) && this.#leadsTo(l, peer.id, mac, vlan, seen),
    );
  }

  #hostFrame(node, frame, host) {
    node.addLatency(LATENCY.host);
    const iface = host.ifaces[0];
    const closed = closedPort(host, iface, frame);
    if (closed) return node.end('dropped', closed);
    if (iface && accepts(host, iface, frame)) return node.end('delivered');
    node.end('discarded', frame.dstMac === iface?.mac ? 'IP de destino ajena' : 'Trama para otro equipo');
  }

  // ---------- Capa 3 ----------

  #routerFrame(node, frame, router, port, vlan) {
    node.addLatency(LATENCY.router);

    const ingress = router.ifaces.find((i) => i.port === port && (i.vlan ?? null) === vlan);
    if (!ingress) return node.end('discarded', `Sin interfaz en la VLAN ${vlan}`);
    if (frame.dstMac !== ingress.mac && !frame.isBroadcast) return node.end('discarded', 'Trama para otro equipo');
    if (frame.protocol === 'arp' || frame.isBroadcast) {
      // La excepción a "un router no reenvía broadcasts": el DHCP relay (ip helper-address)
      if (frame.protocol === 'dhcp' && ingress.dhcpRelay && DHCP_CLIENT_KINDS.has(frame.kind)) {
        return this.#relayToServer(node, frame, router, ingress);
      }
      return accepts(router, ingress, frame)
        ? node.end('delivered')
        : node.end('discarded', 'Un router no reenvía broadcasts');
    }

    // Respuesta del servidor DHCP dirigida al relay: se reenvía al cliente en su VLAN
    const relayIface = router.ifaces.find((i) => i.ip === frame.dstIp && i.ip === frame.payload.giaddr);
    if (frame.protocol === 'dhcp' && relayIface && DHCP_SERVER_KINDS.has(frame.kind)) {
      return this.#relayToClient(node, frame, router, relayIface);
    }

    // Firewall con estado: una respuesta de una sesión abierta no se evalúa contra las políticas
    let packet = frame;
    const session = frame.isReply ? router.sessions.get(replyKey(frame)) : null;
    if (session?.nat) {
      packet = packet.with({ dstIp: session.originalSrc });
      node.note('nat', `NAT ${frame.dstIp} → ${session.originalSrc}`);
    }

    if (router.ifaces.some((i) => i.ip === packet.dstIp)) return node.end('delivered');

    const egress = routeLookup(router, packet.dstIp);
    if (!egress) return node.end('unreachable', 'Sin ruta al destino', { replyFrom: ingress.ip });
    if (packet.ttl <= 1) return node.end('ttl-exceeded', 'TTL agotado', { replyFrom: ingress.ip });

    if (!session) {
      const policy = router.policies.find(
        (p) =>
          p.enabled &&
          p.srcintf.includes(ingress.name) &&
          p.dstintf.includes(egress.name) &&
          matchesService(p.service, packet),
      );
      if (!policy) {
        router.implicitDenyHits++;
        return node.end('dropped', 'Denegado por la política implícita', { policy: 0 });
      }
      policy.hits++;
      if (policy.action !== 'accept') {
        return node.end('dropped', `Denegado por la política #${policy.id}`, { policy: policy.id });
      }
      node.note('policy', `Política #${policy.id} · ${policy.name}`);

      const natIp = policy.nat ? egress.ip : null;
      router.sessions.set(sessionKey(packet.protocol, packet.dstIp, natIp ?? packet.srcIp, packet.flowId), {
        originalSrc: packet.srcIp,
        nat: Boolean(natIp),
      });
      if (natIp) {
        node.note('nat', `NAT ${packet.srcIp} → ${natIp}`);
        packet = packet.with({ srcIp: natIp });
      }
    }

    const mac = this.#nextHopMac(router, egress, packet.dstIp);
    if (!mac) return node.end('unreachable', 'Host inalcanzable (ARP sin respuesta)', { replyFrom: ingress.ip });

    this.#send(node, packet.with({ ttl: packet.ttl - 1, srcMac: egress.mac, dstMac: mac }), router, egress);
  }

  // El relay reenvía el broadcast del cliente como unicast al servidor, anotando en giaddr
  // la interfaz por la que llegó: así el servidor sabe de qué subred dar la IP
  #relayToServer(node, frame, router, ingress) {
    const egress = routeLookup(router, ingress.dhcpRelay);
    const mac = egress && this.#nextHopMac(router, egress, ingress.dhcpRelay);
    if (!mac) return node.end('unreachable', 'Servidor DHCP inalcanzable', { replyFrom: ingress.ip });

    node.end('relayed');
    node.note('relay', `DHCP relay → ${ingress.dhcpRelay}`);
    const relayed = frame.with({
      srcMac: egress.mac,
      dstMac: mac,
      srcIp: ingress.ip,
      dstIp: ingress.dhcpRelay,
      ttl: INITIAL_TTL.firewall,
      payload: { ...frame.payload, giaddr: ingress.ip },
    });
    this.#send(node, relayed, router, egress);
  }

  #relayToClient(node, frame, router, iface) {
    node.end('relayed');
    node.note('relay', `DHCP relay → VLAN ${iface.vlan}`);
    const toClient = frame.with({
      srcMac: iface.mac,
      dstMac: frame.payload.chaddr,
      srcIp: iface.ip,
      dstIp: frame.payload.yiaddr ?? BROADCAST_IP,
      ttl: INITIAL_TTL.firewall,
    });
    this.#send(node, toClient, router, iface);
  }

  // Internet como caja negra: unos cuantos routers del ISP y los hosts públicos detrás
  #cloudFrame(node, frame, cloud) {
    const iface = cloud.ifaces[0];
    if (frame.dstMac !== iface.mac) return node.end('discarded', 'Trama para otro equipo');
    if (frame.dstIp === iface.ip) return node.end('delivered');

    for (let i = 0; i < cloud.route.length; i++) {
      if (frame.ttl - i <= 1) {
        node.addLatency((LATENCY.internet * (i + 1)) / cloud.route.length);
        return node.end('ttl-exceeded', 'TTL agotado en Internet', { replyFrom: cloud.route[i] });
      }
    }
    node.addLatency(LATENCY.internet);

    const host = cloud.hosts.find((h) => h.ip === frame.dstIp);
    if (!host) return node.end('dropped', 'El destino no existe en Internet');
    node.end('delivered', null, { host });
  }

  // ---------- Utilidades ----------

  #egressInterface(device, frame) {
    if (device.role !== 'router') return device.ifaces[0];
    if (frame.protocol === 'arp') return device.ifaces.find((i) => i.ip === frame.payload.senderIp);
    return routeLookup(device, frame.dstIp);
  }

  // MAC del siguiente salto usando lo que el equipo ya tiene aprendido (sin ARP visible)
  #nextHopMac(device, iface, dstIp) {
    if (iface.vlan == null) {
      // Enlace punto a punto (WAN): la MAC es la del otro extremo del cable
      const link = this.#linkOf(device.id, iface.port);
      if (!link) return null;
      const peer = otherEnd(link, device.id);
      return this.device(peer.device).ifaces.find((i) => i.port === peer.port)?.mac ?? null;
    }
    const target = sameSubnet(iface.ip, dstIp, iface.prefix) ? dstIp : iface.gateway;
    const found = this.locate(target);
    return found?.device.up ? found.iface.mac : null;
  }

  #linkOf(deviceId, port) {
    return this.links.find(
      (l) => (l.a.device === deviceId && l.a.port === port) || (l.b.device === deviceId && l.b.port === port),
    );
  }
}

function createDeviceState(config, links) {
  const role = ROLES[config.type] ?? 'host';
  let ifaces = [];

  if (config.interfaces) {
    ifaces = config.interfaces.map((i) => ({ ...i }));
  } else if (config.mac) {
    // Equipos con una sola tarjeta: la interfaz se deduce de los datos planos y de su enlace
    const link = links.find((l) => l.a.device === config.id || l.b.device === config.id);
    const port = role === 'switch' || !link ? null : link.a.device === config.id ? link.a.port : link.b.port;
    ifaces = [
      {
        name: port ?? 'mgmt',
        port,
        ip: config.ip ?? null,
        prefix: config.prefix,
        gateway: config.gateway ?? null,
        dns: config.dns ?? null,
        mac: config.mac,
        vlan: config.vlan ?? null,
      },
    ];
  }

  return {
    id: config.id,
    type: config.type,
    name: config.name,
    role,
    config,
    up: true,
    ifaces,
    arp: new Map(),
    dnsCache: new Map(), // nombre → { ip, ttl }
    sessions: new Map(),
    services: new Map((config.roles ?? []).map((role) => [role, true])), // rol → en marcha
    leases: new Map(), // solo en servidores DHCP: MAC → { ip, hostname, active }
    // Contadores de aciertos por política, como los que muestra FortiOS
    policies: (config.policies ?? []).map((p) => ({ enabled: true, ...p, hits: 0 })),
    implicitDenyHits: 0,
    hosts: config.hosts ?? [],
    route: config.route ?? [],
  };
}

// ¿La pila IP de esta interfaz se queda con la trama?
function accepts(device, iface, frame) {
  if (frame.protocol === 'arp') {
    return frame.kind === 'request' ? frame.payload.targetIp === iface.ip : frame.dstMac === iface.mac;
  }
  if (frame.protocol === 'dhcp') {
    if (frame.dstMac !== iface.mac && !frame.isBroadcast) return false;
    // Los mensajes del cliente solo los escucha quien tiene el servicio DHCP (puerto UDP 67)
    if (DHCP_CLIENT_KINDS.has(frame.kind)) {
      return runs(device, 'DHCP') && (frame.dstIp === BROADCAST_IP || frame.dstIp === iface.ip);
    }
    return frame.payload.chaddr === iface.mac;
  }
  if (frame.dstMac !== iface.mac && !frame.isBroadcast) return false;
  return frame.dstIp === iface.ip || frame.dstIp === BROADCAST_IP;
}

// Una petición unicast dirigida a este equipo para un servicio que tiene pero está detenido
function closedPort(device, iface, frame) {
  const listener = SERVICE_PORTS[frame.protocol];
  if (!iface || !listener?.kinds.has(frame.kind) || !device.services.has(listener.service)) return null;
  if (frame.dstMac !== iface.mac || frame.dstIp !== iface.ip || runs(device, listener.service)) return null;
  return `Puerto ${listener.port} cerrado: servicio ${listener.service} detenido`;
}

// Red conectada directamente o, si no, la interfaz con puerta de enlace (ruta por defecto)
const routeLookup = (router, ip) =>
  router.ifaces.find((i) => sameSubnet(i.ip, ip, i.prefix)) ?? router.ifaces.find((i) => i.gateway) ?? null;

const touches = (link, deviceId) => link.a.device === deviceId || link.b.device === deviceId;
const otherEnd = (link, deviceId) => (link.a.device === deviceId ? link.b : link.a);
const carries = (link, vlan) =>
  (link.mode === 'access' && link.vlan === vlan) || (link.mode === 'trunk' && link.vlans.includes(vlan));

const sessionKey = (protocol, remoteIp, localIp, flowId) => `${protocol}|${remoteIp}|${localIp}|${flowId}`;

// Un error ICMP lo envía un router intermedio, pero pertenece a la sesión del paquete original
const replyKey = (frame) =>
  sessionKey(frame.protocol, frame.payload.original?.dstIp ?? frame.srcIp, frame.dstIp, frame.flowId);
