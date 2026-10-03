import { traceroute } from '../../protocols/icmp.js';
import { isIpv4, traceTime } from '../format.js';

const MAX_HOPS = 30;

export async function* tracert({ sim, deviceId, args, signal }) {
  const target = args.find((a) => !a.startsWith('-'));
  if (!target) {
    yield 'Uso: tracert nombre_destino';
    return;
  }
  if (!isIpv4(target)) {
    yield `No se puede resolver el nombre de sistema de destino ${target}.`;
    return;
  }

  yield '';
  yield `Traza a ${target} sobre caminos de ${MAX_HOPS} saltos como máximo.`;
  yield '';

  let completed = false;
  for await (const result of traceroute(sim, deviceId, target, { maxHops: MAX_HOPS, signal })) {
    yield row(sim, result);
    completed = result.status === 'reply';
  }

  yield '';
  if (signal?.aborted) yield 'Control-C';
  else if (completed) yield 'Traza completa.';
  else yield '(Simulación: la traza se detiene tras 3 saltos sin respuesta).';
}

// "  2     8 ms     7 ms     9 ms  203.0.113.1"
function row(sim, { hop, status, from, time }) {
  const prefix = String(hop).padStart(3);
  if (status === 'timeout') {
    return `${prefix}${traceTime(null).repeat(3)}  Tiempo de espera agotado para esta solicitud.`;
  }
  if (status === 'no-route') return `${prefix}  Error general.`;
  // Se anima una sonda por salto; las otras dos columnas varían un poco sobre su tiempo
  const times = [time, time * (0.9 + sim.random() * 0.2), time * (0.9 + sim.random() * 0.2)];
  const suffix = status === 'unreachable' ? ' informes: Host de destino inaccesible.' : '';
  return `${prefix}${times.map(traceTime).join('')}  ${from}${suffix}`;
}
