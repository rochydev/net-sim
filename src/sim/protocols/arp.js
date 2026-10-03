import { Packet, BROADCAST_MAC } from '../Packet.js';

// Resuelve la MAC de una IP de la misma subred. Si no está en la caché ARP del equipo,
// pregunta por broadcast a toda la VLAN y espera la respuesta del dueño de esa IP.
export async function resolveMac(sim, deviceId, ip) {
  const host = sim.engine.device(deviceId);
  if (host.arp.has(ip)) return host.arp.get(ip);

  const iface = host.ifaces[0];
  const request = new Packet({
    protocol: 'arp',
    kind: 'request',
    srcMac: iface.mac,
    dstMac: BROADCAST_MAC,
    payload: { senderIp: iface.ip, targetIp: ip },
  });
  const trace = await sim.send(request, deviceId);
  const owner = trace.delivered[0];
  if (!owner) return null;

  const responder = sim.engine.device(owner.device);
  const responderIface = responder.ifaces.find((i) => i.ip === ip);
  // Quien recibe una petición ARP aprovecha para apuntarse la MAC del que pregunta
  responder.arp.set(iface.ip, iface.mac);

  const reply = new Packet({
    protocol: 'arp',
    kind: 'reply',
    srcMac: responderIface.mac,
    dstMac: iface.mac,
    payload: { senderIp: ip, targetIp: iface.ip },
  });
  const back = await sim.send(reply, owner.device);
  if (!back.deliveredTo(deviceId)) return null;

  host.arp.set(ip, responderIface.mac);
  return responderIface.mac;
}
