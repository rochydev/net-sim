import { lookup, qualify, serverName } from '../../protocols/dns.js';
import { isIpv4 } from '../../ip.js';

// nslookup nombre [servidor]. Pregunta siempre al servidor (no usa la caché del sistema),
// por eso es la herramienta para saber si el problema está en el DNS o en otra parte.
export async function* nslookup({ sim, deviceId, args }) {
  const [name, explicitServer] = args;
  if (!name) {
    yield 'Uso: nslookup nombre [servidor]';
    return;
  }

  const server = explicitServer ?? sim.engine.device(deviceId).ifaces[0].dns;
  if (!server || !isIpv4(server)) {
    yield '*** No se puede encontrar la dirección del servidor DNS.';
    return;
  }

  const fqdn = qualify(sim, deviceId, name) ?? name.toLowerCase();
  const response = await lookup(sim, deviceId, server, fqdn);

  if (!response) {
    yield 'DNS request timed out.';
    yield '    timeout was 2 seconds.';
    yield 'Servidor:  UnKnown';
    yield `Address:  ${server}`;
    yield '';
    yield '*** Se agotó el tiempo de espera de la solicitud a UnKnown.';
    return;
  }

  const label = serverName(sim, server);
  yield `Servidor:  ${label}`;
  yield `Address:  ${server}`;
  yield '';
  if (response.rcode === 'NXDOMAIN') {
    yield `*** ${label} no encuentra ${fqdn}: Non-existent domain`;
    return;
  }
  if (response.rcode !== 'NOERROR') {
    yield `*** ${label} no encuentra ${fqdn}: Server failed`;
    return;
  }
  // Solo el servidor de la zona responde con autoridad; si la respuesta viene de su caché
  // o de preguntar a otro, Windows lo avisa
  if (!response.authoritative) yield 'Respuesta no autoritativa:';
  yield `Nombre:  ${fqdn}`;
  yield `Address:  ${response.answer}`;
}
