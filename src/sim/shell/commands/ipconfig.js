import { prefixToMask, isApipa } from '../../ip.js';
import { release, renew } from '../../protocols/dhcp.js';
import { dotted, dashedMac } from '../format.js';

const NIC_MODEL = {
  pc: 'Intel(R) Ethernet Connection (17) I219-LM',
  laptop: 'Realtek PCIe GbE Family Controller',
  server: 'Microsoft Hyper-V Network Adapter',
};

export async function* ipconfig({ sim, deviceId, args }) {
  const option = args[0]?.toLowerCase();
  const device = sim.engine.device(deviceId);

  if (option === '/release' || option === '/renew') {
    const result = option === '/release' ? await release(sim, deviceId) : await renew(sim, deviceId);
    yield '';
    yield 'Configuración IP de Windows';
    yield '';
    if (result.status === 'static') {
      yield 'La operación ha fallado porque el adaptador Ethernet no tiene habilitado DHCP.';
      return;
    }
    if (result.status === 'apipa') {
      yield 'Error al renovar la interfaz Ethernet: No se puede establecer contacto con el servidor DHCP.';
      yield 'Se agotó el tiempo de espera de la solicitud.';
      return;
    }
    yield* adapter(sim, device, false);
    return;
  }

  if (option && option !== '/all') {
    yield `Error: no se reconoce o no está completa la opción de la línea de comandos "${args[0]}".`;
    return;
  }

  const all = option === '/all';
  yield '';
  yield 'Configuración IP de Windows';
  yield '';
  if (all) {
    yield dotted('Nombre de host', device.name, 32);
    yield dotted('Sufijo DNS principal', dnsSuffix(sim, device), 32);
    yield dotted('Tipo de nodo', 'híbrido', 32);
    yield dotted('Enrutamiento IP habilitado', 'no', 32);
    yield '';
  }
  yield* adapter(sim, device, all);
}

function* adapter(sim, device, all) {
  const iface = device.ifaces[0];
  const dhcp = device.config.addressing === 'dhcp';
  const apipa = isApipa(iface.ip);

  yield 'Adaptador de Ethernet Ethernet:';
  yield '';
  yield dotted('Sufijo DNS específico para la conexión', iface.ip && !apipa ? dnsSuffix(sim, device) : '');
  if (all) {
    yield dotted('Descripción', NIC_MODEL[device.type]);
    yield dotted('Dirección física', dashedMac(iface.mac));
    yield dotted('DHCP habilitado', dhcp ? 'sí' : 'no');
    yield dotted('Configuración automática habilitada', 'sí');
  }
  if (iface.ip) {
    const label = apipa ? 'Dirección IPv4 de configuración automática' : 'Dirección IPv4';
    yield dotted(label, all ? `${iface.ip}(Preferido)` : iface.ip);
    yield dotted('Máscara de subred', prefixToMask(iface.prefix));
  }
  yield dotted('Puerta de enlace predeterminada', iface.gateway ?? '');
  if (all && iface.ip) {
    if (iface.dhcpServer) yield dotted('Servidor DHCP', iface.dhcpServer);
    yield dotted('Servidores DNS', iface.dns ?? '');
  }
}

// Los equipos de invitados no están unidos al dominio
const dnsSuffix = (sim, device) => (device.type === 'laptop' ? '' : sim.topology.domain);
