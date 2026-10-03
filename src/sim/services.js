// Objetos de servicio, como en FortiOS: una política dice qué servicios permite
const SERVICES = {
  ALL: () => true,
  PING: (packet) => packet.protocol === 'icmp',
  DNS: (packet) => packet.protocol === 'dns',
  DHCP: (packet) => packet.protocol === 'dhcp',
  WEB: (packet) => packet.protocol === 'http' || packet.protocol === 'https',
};

export const matchesService = (names, packet) => names.some((name) => SERVICES[name]?.(packet));
