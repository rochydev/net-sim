import { prefixToMask } from '../../ip.js';
import { dotted, dashedMac } from '../format.js';

const NIC_MODEL = {
  pc: 'Intel(R) Ethernet Connection (17) I219-LM',
  laptop: 'Realtek PCIe GbE Family Controller',
  server: 'Microsoft Hyper-V Network Adapter',
};

export async function* ipconfig({ sim, deviceId, args }) {
  const device = sim.engine.device(deviceId);
  const iface = device.ifaces[0];
  const all = args.some((a) => a.toLowerCase() === '/all');
  // Los equipos de invitados no están unidos al dominio
  const suffix = device.type === 'laptop' ? '' : sim.topology.domain;
  const dhcp = device.config.addressing === 'dhcp';

  yield '';
  yield 'Configuración IP de Windows';
  yield '';
  if (all) {
    yield dotted('Nombre de host', device.name, 32);
    yield dotted('Sufijo DNS principal', suffix, 32);
    yield dotted('Tipo de nodo', 'híbrido', 32);
    yield dotted('Enrutamiento IP habilitado', 'no', 32);
    yield '';
  }

  yield 'Adaptador de Ethernet Ethernet:';
  yield '';
  yield dotted('Sufijo DNS específico para la conexión', suffix);
  if (all) {
    yield dotted('Descripción', NIC_MODEL[device.type]);
    yield dotted('Dirección física', dashedMac(iface.mac));
    yield dotted('DHCP habilitado', dhcp ? 'sí' : 'no');
    yield dotted('Configuración automática habilitada', 'sí');
  }
  yield dotted('Dirección IPv4', all ? `${iface.ip}(Preferido)` : iface.ip);
  yield dotted('Máscara de subred', prefixToMask(iface.prefix));
  yield dotted('Puerta de enlace predeterminada', iface.gateway ?? '');
  if (all) {
    if (dhcp) yield dotted('Servidor DHCP', dhcpServer(sim) ?? '');
    yield dotted('Servidores DNS', iface.dns ?? '');
  }
}

const dhcpServer = (sim) => sim.topology.devices.find((d) => d.roles?.includes('DHCP'))?.ip;
