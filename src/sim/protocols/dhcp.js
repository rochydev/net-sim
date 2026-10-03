import { Packet, BROADCAST_MAC, BROADCAST_IP } from '../Packet.js';
import { ipToInt, intToIp, sameSubnet, isApipa } from '../ip.js';
import { resolveMac } from './arp.js';
import { runs } from '../NetworkEngine.js';

const DISCOVER_ATTEMPTS = 3;
const RETRY_WAIT_MS = 1500;

let nextXid = 0x3903f326;

export const usesDhcp = (device) => device.config.addressing === 'dhcp';

// ---------- Cliente ----------

// ipconfig /release: avisa al servidor (unicast) y deja la tarjeta sin IP
export async function release(sim, clientId) {
  const { engine } = sim;
  const client = engine.device(clientId);
  const iface = client.ifaces[0];
  if (!usesDhcp(client)) return { status: 'static' };

  if (iface.ip && !isApipa(iface.ip) && iface.dhcpServer) {
    const mac = await nextHopMac(sim, client, iface.dhcpServer);
    if (mac) {
      const xid = nextXid++;
      const packet = new Packet({
        protocol: 'dhcp',
        kind: 'release',
        srcMac: iface.mac,
        dstMac: mac,
        srcIp: iface.ip,
        dstIp: iface.dhcpServer,
        ttl: engine.initialTtl(clientId),
        flowId: `dhcp-${xid}`,
        payload: { xid, chaddr: iface.mac, ciaddr: iface.ip },
      });
      await transact(sim, clientId, packet);
    }
  }

  configure(sim, client, { ip: null, prefix: null, gateway: null, dns: null, dhcpServer: null });
  return { status: 'released' };
}

// ipconfig /renew. Con concesión vigente, Windows la renueva por unicast con su servidor
// (Request → ACK). Sin IP, hace el proceso completo por broadcast: Discover, Offer, Request, ACK.
// Si nadie responde, se autoasigna una dirección APIPA (169.254.x.x).
export async function renew(sim, clientId) {
  const client = sim.engine.device(clientId);
  const iface = client.ifaces[0];
  if (!usesDhcp(client)) return { status: 'static' };

  if (iface.ip && !isApipa(iface.ip) && iface.dhcpServer) {
    const ack = await unicastRenew(sim, client);
    if (ack) return bind(sim, client, ack.payload);
  }
  return dora(sim, client);
}

async function dora(sim, client) {
  const iface = client.ifaces[0];
  const xid = nextXid++;
  // Sin IP todavía: origen 0.0.0.0 y destino broadcast; el servidor lo identifica por la MAC (chaddr)
  const broadcast = {
    protocol: 'dhcp',
    srcMac: iface.mac,
    dstMac: BROADCAST_MAC,
    srcIp: '0.0.0.0',
    dstIp: BROADCAST_IP,
    ttl: sim.engine.initialTtl(client.id),
    flowId: `dhcp-${xid}`,
  };

  let offer = null;
  for (let attempt = 1; attempt <= DISCOVER_ATTEMPTS && !offer; attempt++) {
    if (attempt > 1) await sim.wait(RETRY_WAIT_MS);
    offer = await transact(
      sim,
      client.id,
      new Packet({ ...broadcast, kind: 'discover', payload: { xid, chaddr: iface.mac } }),
    );
  }
  if (!offer) return autoconfigure(sim, client);

  const request = new Packet({
    ...broadcast,
    kind: 'request',
    payload: { xid, chaddr: iface.mac, requestedIp: offer.payload.yiaddr, serverId: offer.payload.serverId },
  });
  const ack = await transact(sim, client.id, request);
  if (ack?.kind !== 'ack') return autoconfigure(sim, client);
  return bind(sim, client, ack.payload);
}

async function unicastRenew(sim, client) {
  const iface = client.ifaces[0];
  const mac = await nextHopMac(sim, client, iface.dhcpServer);
  if (!mac) return null;

  const xid = nextXid++;
  const request = new Packet({
    protocol: 'dhcp',
    kind: 'request',
    srcMac: iface.mac,
    dstMac: mac,
    srcIp: iface.ip,
    dstIp: iface.dhcpServer,
    ttl: sim.engine.initialTtl(client.id),
    flowId: `dhcp-${xid}`,
    payload: { xid, chaddr: iface.mac, ciaddr: iface.ip, requestedIp: iface.ip },
  });
  const ack = await transact(sim, client.id, request);
  return ack?.kind === 'ack' ? ack : null;
}

// Envía un mensaje del cliente, deja que el servidor que lo reciba conteste
// y devuelve la respuesta tal como le llega al cliente (o null)
async function transact(sim, clientId, message) {
  const trace = await sim.send(message, clientId);
  const atServer = trace.delivered.find((n) => runs(sim.engine.device(n.device), 'DHCP'));
  if (!atServer) return null;

  const reply = serve(sim.engine, atServer.device, atServer.frame);
  sim.deviceChanged(atServer.device); // la tabla de concesiones del servidor ha cambiado
  if (!reply) return null;
  return (await sim.send(reply, atServer.device)).deliveredTo(clientId)?.frame ?? null;
}

function bind(sim, client, lease) {
  configure(sim, client, {
    ip: lease.yiaddr,
    prefix: lease.prefix,
    gateway: lease.gateway,
    dns: lease.dns,
    dhcpServer: lease.serverId,
  });
  return { status: 'bound', ip: lease.yiaddr };
}

// APIPA (RFC 3927): 169.254.0.0/16 sin puerta de enlace. Solo sirve para hablar con
// vecinos que también estén en APIPA; cualquier otra red queda inalcanzable.
function autoconfigure(sim, client) {
  const bytes = client.ifaces[0].mac.split(':').map((h) => parseInt(h, 16));
  const ip = `169.254.${(bytes[4] % 254) + 1}.${(bytes[5] % 254) + 1}`;
  configure(sim, client, { ip, prefix: 16, gateway: null, dns: null, dhcpServer: null });
  return { status: 'apipa', ip };
}

function configure(sim, client, settings) {
  const iface = client.ifaces[0];
  if (settings.ip !== iface.ip) client.arp.clear(); // Windows vacía la caché ARP al cambiar de IP
  Object.assign(iface, settings);
  sim.deviceChanged(client.id);
}

async function nextHopMac(sim, client, ip) {
  const hop = sim.engine.nextHopIp(client.id, ip);
  return hop ? resolveMac(sim, client.id, hop) : null;
}

// ---------- Servidor ----------

// Respuesta del servidor DHCP a un mensaje del cliente, o null si no responde.
// El ámbito se elige por giaddr (la interfaz del relay) o por la IP actual del cliente.
export function serve(engine, serverId, frame) {
  const server = engine.device(serverId);
  const { scopes, leaseHours } = server.config.dhcp;
  const { chaddr, giaddr, ciaddr, xid } = frame.payload;

  if (frame.kind === 'release') {
    const lease = server.leases.get(chaddr);
    if (lease) lease.active = false;
    return null;
  }

  const scope = scopes.find((s) => sameSubnet(s.network, giaddr ?? ciaddr ?? server.ifaces[0].ip, s.prefix));
  if (!scope) return null;

  let kind;
  let lease = server.leases.get(chaddr);
  if (frame.kind === 'discover') {
    lease = lease && inScope(scope, lease.ip) ? lease : allocate(engine, server, scope, chaddr);
    if (!lease) return null; // ámbito agotado
    kind = 'offer';
  } else {
    kind = lease && lease.ip === frame.payload.requestedIp ? 'ack' : 'nak';
    if (kind === 'ack') lease.active = true;
  }

  const serverIface = server.ifaces[0];
  const unicastTo = giaddr ?? ciaddr;
  return new Packet({
    protocol: 'dhcp',
    kind,
    srcMac: unicastTo ? null : serverIface.mac,
    dstMac: unicastTo ? null : BROADCAST_MAC,
    srcIp: serverIface.ip,
    dstIp: unicastTo ?? BROADCAST_IP,
    ttl: engine.initialTtl(serverId),
    flowId: frame.flowId,
    payload: {
      xid,
      chaddr,
      giaddr,
      yiaddr: kind === 'nak' ? undefined : lease.ip,
      prefix: scope.prefix,
      gateway: scope.gateway,
      dns: scope.dns,
      serverId: serverIface.ip,
      leaseHours,
    },
  });
}

const inScope = (scope, ip) => sameSubnet(scope.network, ip, scope.prefix);

// Primera IP libre del rango: ni concedida a otra MAC ni configurada a mano en algún equipo
function allocate(engine, server, scope, mac) {
  const taken = new Set([...server.leases.values()].map((l) => l.ip));
  const [first, last] = scope.range.map(ipToInt);
  for (let n = first; n <= last; n++) {
    const ip = intToIp(n);
    if (taken.has(ip) || engine.locate(ip)) continue;
    const lease = { ip, hostname: null, active: false };
    server.leases.set(mac, lease);
    return lease;
  }
  return null;
}
