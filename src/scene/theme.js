// Paleta de la escena y de la UI que la describe (leyenda, captura).
// Tonos apagados: el color se reserva para distinguir protocolos y VLANs, no para decorar.
export const PROTOCOL_COLORS = {
  icmp: '#56b6c2',
  arp: '#e5c07b',
  dhcp: '#98c379',
  dns: '#c678dd',
};

export const PROTOCOL_NAMES = {
  icmp: 'ICMP',
  arp: 'ARP',
  dhcp: 'DHCP',
  dns: 'DNS',
};

export const STATUS_COLORS = {
  danger: '#e06c75',
  warning: '#d19a66',
  success: '#98c379',
  info: '#6b9bf2',
};

export const CABLE_COLORS = {
  trunk: '#aeb6c2',
  wan: '#c76b73',
};

export const DEVICE_ACCENTS = {
  cloud: '#8fa3bf',
  firewall: '#e06c75',
  switch: '#aeb6c2',
};

export const SCENE_COLORS = {
  background: 0x0e1116,
  floor: 0x13171c,
  gridMajor: 0x1d232b,
  gridMinor: 0x171b21,
};
