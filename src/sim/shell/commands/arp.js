import { dashedMac } from '../format.js';

export async function* arp({ sim, deviceId, args }) {
  const option = args[0]?.toLowerCase();
  const device = sim.engine.device(deviceId);

  // arp -d * vacía la caché (en Windows requiere consola de administrador; aquí se permite siempre)
  if (option === '-d' || option === '/d') {
    if (args[1] === '*') device.arp.clear();
    else device.arp.delete(args[1]);
    return;
  }

  if (!['-a', '-g', '/a'].includes(option)) {
    yield 'Uso: arp -a | arp -d <IP> | arp -d *';
    return;
  }

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
