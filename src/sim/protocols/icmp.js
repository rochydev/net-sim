import { Packet } from '../Packet.js';
import { resolveMac } from './arp.js';

let identifier = 0;

// Un Echo Request y su respuesta. Devuelve datos, no texto: el formato lo pone el shell.
//
// status:
//   reply         respuesta del destino ({ from, ttl, time })
//   timeout       no vuelve nada (firewall que descarta, equipo apagado...)
//   ttl-exceeded  un router devuelve "TTL caducado" ({ from }) — lo usa tracert
//   unreachable   "host de destino inaccesible" ({ from })
//   no-route      el host no tiene puerta de enlace para salir de su subred
export async function echo(sim, srcId, dstIp, { ttl, seq = 1 } = {}) {
  const { engine } = sim;
  const iface = engine.device(srcId).ifaces[0];

  const nextHop = engine.nextHopIp(srcId, dstIp);
  if (!nextHop) return { status: 'no-route' };

  // Si nadie responde al ARP, Windows contesta en nombre propio: "host de destino inaccesible"
  const mac = await resolveMac(sim, srcId, nextHop);
  if (!mac) return { status: 'unreachable', from: iface.ip };

  const request = new Packet({
    protocol: 'icmp',
    kind: 'echo-request',
    srcMac: iface.mac,
    dstMac: mac,
    srcIp: iface.ip,
    dstIp,
    ttl: ttl ?? engine.initialTtl(srcId),
    flowId: `${++identifier}`,
    payload: { seq },
  });
  const trace = await sim.send(request, srcId);

  const target = engine.locate(dstIp);
  const arrived = target && trace.deliveredTo(target.device.id);
  if (arrived) {
    // El destino responde a quien ve como origen (tras un NAT, la IP pública del firewall)
    const reply = new Packet({
      protocol: 'icmp',
      kind: 'echo-reply',
      srcIp: dstIp,
      dstIp: arrived.frame.srcIp,
      ttl: engine.initialTtl(target.device.id),
      flowId: request.flowId,
      payload: { seq },
    });
    const back = (await sim.send(reply, target.device.id)).deliveredTo(srcId);
    if (!back) return { status: 'timeout' };
    return { status: 'reply', from: dstIp, ttl: back.frame.ttl, time: jitter(sim, arrived.time + back.time) };
  }

  const failure = trace.failure;
  if (failure?.outcome === 'ttl-exceeded' || failure?.outcome === 'unreachable') {
    const error = new Packet({
      protocol: 'icmp',
      kind: failure.outcome === 'ttl-exceeded' ? 'time-exceeded' : 'unreachable',
      srcIp: failure.data.replyFrom,
      dstIp: failure.frame.srcIp,
      ttl: engine.initialTtl(failure.device),
      flowId: request.flowId,
      payload: { seq, original: { srcIp: failure.frame.srcIp, dstIp } },
    });
    const back = (await sim.send(error, failure.device)).deliveredTo(srcId);
    if (back) {
      return { status: failure.outcome, from: failure.data.replyFrom, time: jitter(sim, failure.time + back.time) };
    }
  }
  return { status: 'timeout' };
}

// Pings sucesivos, con un segundo de pausa como Windows. Genera un resultado por intento.
export async function* ping(sim, srcId, dstIp, { count = 4, ttl, signal } = {}) {
  for (let seq = 1; count === Infinity || seq <= count; seq++) {
    if (signal?.aborted) return;
    yield await echo(sim, srcId, dstIp, { seq, ttl });
    if (seq !== count && !signal?.aborted) await sim.wait(1000);
  }
}

// tracert: Echo Requests con TTL 1, 2, 3... Cada router en el que se agota el TTL
// se delata respondiendo "TTL caducado", y así se descubre el camino.
// Simplificación: se anima una sonda por salto (Windows envía tres).
export async function* traceroute(sim, srcId, dstIp, { maxHops = 30, giveUpAfter = 3, signal } = {}) {
  let consecutiveTimeouts = 0;
  for (let hop = 1; hop <= maxHops; hop++) {
    if (signal?.aborted) return;
    const result = await echo(sim, srcId, dstIp, { ttl: hop, seq: hop });
    yield { hop, ...result };
    if (result.status === 'reply' || result.status === 'unreachable' || result.status === 'no-route') return;

    consecutiveTimeouts = result.status === 'timeout' ? consecutiveTimeouts + 1 : 0;
    if (consecutiveTimeouts >= giveUpAfter) return;
  }
}

// Pequeña variación para que los tiempos no salgan siempre idénticos
const jitter = (sim, ms) => ms * (0.85 + sim.random() * 0.3);
