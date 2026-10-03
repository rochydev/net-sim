import { ping as sendPings } from '../../protocols/icmp.js';
import { resolveName } from '../../protocols/dns.js';
import { pingTime } from '../format.js';

export async function* ping({ sim, deviceId, args, signal }) {
  const options = parse(args);
  if (options.error) {
    yield options.error;
    return;
  }
  if (!options.target) {
    yield 'Uso: ping [-t] [-n cuenta] [-i TTL] nombre_destino';
    return;
  }

  // Antes del primer paquete ICMP, el nombre se traduce a IP (caché local o consulta DNS)
  const resolved = await resolveName(sim, deviceId, options.target);
  if (resolved.status !== 'resolved') {
    yield `La solicitud de ping no pudo encontrar el host ${options.target}. Compruebe el nombre y vuelva a intentarlo.`;
    return;
  }

  const target = resolved.ip;
  const stats = { sent: 0, received: 0, times: [] };

  yield '';
  yield resolved.name === target
    ? `Haciendo ping a ${target} con 32 bytes de datos:`
    : `Haciendo ping a ${resolved.name} [${target}] con 32 bytes de datos:`;

  for await (const result of sendPings(sim, deviceId, target, { count: options.count, ttl: options.ttl, signal })) {
    stats.sent++;
    yield describe(result);
    // Peculiaridad real de Windows: "host de destino inaccesible" cuenta como recibido
    if (result.status === 'reply' || result.status === 'unreachable' || result.status === 'ttl-exceeded') {
      stats.received++;
    }
    if (result.status === 'reply') stats.times.push(result.time);
  }
  if (signal?.aborted) yield 'Control-C';

  yield* summary(target, stats);
}

function describe(result) {
  switch (result.status) {
    case 'reply':
      return `Respuesta desde ${result.from}: bytes=32 ${pingTime(result.time)} TTL=${result.ttl}`;
    case 'unreachable':
      return `Respuesta desde ${result.from}: Host de destino inaccesible.`;
    case 'ttl-exceeded':
      return `Respuesta desde ${result.from}: TTL caducado en tránsito.`;
    case 'no-route':
      return 'PING: error en la transmisión. Error general.';
    default:
      return 'Tiempo de espera agotado para esta solicitud.';
  }
}

function* summary(target, { sent, received, times }) {
  if (!sent) return;
  const lost = sent - received;
  yield '';
  yield `Estadísticas de ping para ${target}:`;
  yield `    Paquetes: enviados = ${sent}, recibidos = ${received}, perdidos = ${lost}`;
  yield `    (${Math.round((lost / sent) * 100)}% perdidos),`;
  if (times.length) {
    // Windows trunca a milisegundos enteros: lo que se ve como "tiempo<1m" cuenta como 0ms
    const rounded = times.map(Math.floor);
    const avg = Math.round(rounded.reduce((a, b) => a + b, 0) / rounded.length);
    yield 'Tiempos aproximados de ida y vuelta en milisegundos:';
    yield `    Mínimo = ${Math.min(...rounded)}ms, Máximo = ${Math.max(...rounded)}ms, Media = ${avg}ms`;
  }
}

function parse(args) {
  const options = { count: 4, ttl: undefined, target: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i].toLowerCase();
    if (arg === '-t') options.count = Infinity;
    else if (arg === '-n' || arg === '-i') {
      const value = Number(args[++i]);
      if (!Number.isInteger(value) || value < 1 || value > 255) {
        return { error: `Valor incorrecto para la opción ${arg}.` };
      }
      if (arg === '-n') options.count = value;
      else options.ttl = value;
    } else if (arg.startsWith('-') || arg.startsWith('/')) return { error: `Opción incorrecta ${args[i]}.` };
    else options.target = args[i];
  }
  return options;
}
