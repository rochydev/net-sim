import { dashedMac } from '../format.js';

export async function* arp({ sim, deviceId, args }) {
  if (!args.some((a) => ['-a', '-g', '/a'].includes(a.toLowerCase()))) {
    yield 'Uso: arp -a';
    return;
  }

  const device = sim.engine.device(deviceId);
  if (!device.arp.size) {
    yield 'No se encontraron entradas ARP.';
    return;
  }

  yield '';
  yield `Interfaz: ${device.ifaces[0].ip} --- 0xb`;
  yield '  Dirección de Internet          Dirección física      Tipo';
  for (const [ip, mac] of device.arp) {
    yield `  ${ip.padEnd(23)}${dashedMac(mac).toLowerCase().padEnd(22)}dinámico`;
  }
}
