import { Packet } from '../Packet.js';
import { isIpv4 } from '../ip.js';
import { runs } from '../NetworkEngine.js';
import { resolveMac } from './arp.js';

const QUERY_ATTEMPTS = 2;
const RETRY_WAIT_MS = 1000;

let nextTxid = 0x1a2b;

// ---------- Cliente (servicio "Cliente DNS" de Windows) ----------

// Nombre completo a consultar. Un nombre de una sola etiqueta ("intranet") se completa
// con el sufijo DNS del equipo, como hace Windows en un equipo unido al dominio.
export function qualify(sim, deviceId, name) {
  const fqdn = name.toLowerCase().replace(/\.$/, '');
  if (fqdn.includes('.')) return fqdn;
  const suffix = sim.engine.device(deviceId).config.domain;
  return suffix ? `${fqdn}.${suffix}` : null;
}

// Resolución que usan ping y tracert: primero la caché local, después el servidor DNS configurado.
// status: resolved | not-found | timeout | no-server
export async function resolveName(sim, clientId, name) {
  if (isIpv4(name)) return { status: 'resolved', ip: name, name };

  const fqdn = qualify(sim, clientId, name);
  if (!fqdn) return { status: 'not-found', name };

  const client = sim.engine.device(clientId);
  const cached = client.dnsCache.get(fqdn);
  if (cached) return { status: 'resolved', ip: cached.ip, name: fqdn, cached: true };

  const server = client.ifaces[0].dns;
  if (!server || !client.ifaces[0].ip) return { status: 'no-server', name: fqdn };

  const response = await lookup(sim, clientId, server, fqdn);
  if (!response) return { status: 'timeout', name: fqdn, server };
  if (response.rcode !== 'NOERROR') return { status: 'not-found', name: fqdn, server };

  client.dnsCache.set(fqdn, { ip: response.answer, ttl: response.ttl });
  return { status: 'resolved', ip: response.answer, name: fqdn, server };
}

// Pregunta un nombre a un servidor concreto, con reintento. nslookup la usa directamente
// porque, a diferencia de ping, no consulta la caché del sistema.
export async function lookup(sim, fromId, serverIp, fqdn, { attempts = QUERY_ATTEMPTS } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) await sim.wait(RETRY_WAIT_MS);
    const response = await query(sim, fromId, serverIp, fqdn);
    if (response) return response;
  }
  return null;
}

async function query(sim, fromId, serverIp, qname) {
  const { engine } = sim;
  const iface = engine.device(fromId).ifaces[0];

  // Un servidor que se pregunta a sí mismo no saca nada a la red (bucle local)
  if (iface.ip === serverIp) return answer(sim, fromId, serverIp, qname);

  const hop = engine.nextHopIp(fromId, serverIp);
  const mac = hop && (await resolveMac(sim, fromId, hop));
  if (!mac) return null;

  const txid = nextTxid++ & 0xffff;
  const request = new Packet({
    protocol: 'dns',
    kind: 'query',
    srcMac: iface.mac,
    dstMac: mac,
    srcIp: iface.ip,
    dstIp: serverIp,
    ttl: engine.initialTtl(fromId),
    flowId: `dns-${txid}`,
    payload: { txid, qname },
  });
  const trace = await sim.send(request, fromId);

  const target = engine.locate(serverIp);
  const atServer = target && trace.deliveredTo(target.device.id);
  if (!atServer) return null;

  const result = await answer(sim, target.device.id, serverIp, qname);
  if (!result) return null;

  const response = new Packet({
    protocol: 'dns',
    kind: 'response',
    srcIp: serverIp,
    dstIp: atServer.frame.srcIp, // tras un NAT, la IP pública del firewall
    ttl: engine.initialTtl(target.device.id),
    flowId: request.flowId,
    payload: { txid, qname, ...result },
  });
  return (await sim.send(response, target.device.id)).deliveredTo(fromId)?.frame.payload ?? null;
}

// ---------- Servidores ----------

// Respuesta de quien recibe la consulta, o null si no hay un servidor DNS escuchando.
// rcode: NOERROR | NXDOMAIN (no existe) | SERVFAIL (no ha podido averiguarlo)
async function answer(sim, serverId, serverIp, qname) {
  const server = sim.engine.device(serverId);
  if (server.role === 'cloud') return publicResolver(server, serverIp, qname);
  if (!runs(server, 'DNS')) return null;

  const { zones, forwarders } = server.config.dnsServer;
  const zone = Object.keys(zones).find((z) => qname === z || qname.endsWith(`.${z}`));
  if (zone) {
    const ip = zones[zone][qname.slice(0, -(zone.length + 1))];
    return ip
      ? { rcode: 'NOERROR', answer: ip, authoritative: true, ttl: 3600 }
      : { rcode: 'NXDOMAIN', authoritative: true };
  }

  const cached = server.dnsCache.get(qname);
  if (cached) return { rcode: 'NOERROR', answer: cached.ip, authoritative: false, ttl: cached.ttl };

  // Recursión: el servidor pregunta a su reenviador y guarda la respuesta para los siguientes
  for (const forwarder of forwarders) {
    const response = await lookup(sim, serverId, forwarder, qname, { attempts: 1 });
    if (!response) continue;
    if (response.rcode === 'NOERROR') server.dnsCache.set(qname, { ip: response.answer, ttl: response.ttl });
    return { rcode: response.rcode, answer: response.answer, authoritative: false, ttl: response.ttl };
  }
  return { rcode: 'SERVFAIL', authoritative: false };
}

function publicResolver(cloud, resolverIp, qname) {
  if (!cloud.hosts.find((h) => h.ip === resolverIp)?.resolver) return null;
  const host = cloud.hosts.find((h) => h.name === qname);
  return host
    ? { rcode: 'NOERROR', answer: host.ip, authoritative: false, ttl: 300 }
    : { rcode: 'NXDOMAIN', authoritative: false };
}

// Nombre de un servidor DNS a partir de su IP, para la cabecera de nslookup.
// (nslookup real lo obtiene con una consulta PTR; aquí se busca directamente en los datos)
export function serverName(sim, ip) {
  for (const device of sim.engine.devices.values()) {
    const host = device.hosts.find((h) => h.ip === ip);
    if (host) return host.name;
    for (const [zone, records] of Object.entries(device.config.dnsServer?.zones ?? {})) {
      const label = Object.keys(records).find((name) => records[name] === ip);
      if (label) return `${label}.${zone}`;
    }
  }
  return 'UnKnown';
}
