export const BROADCAST_MAC = 'FF:FF:FF:FF:FF:FF';
export const BROADCAST_IP = '255.255.255.255';

// Mensajes DHCP según quién los envía (puertos UDP 68 → 67 y 67 → 68)
export const DHCP_CLIENT_KINDS = new Set(['discover', 'request', 'release']);
export const DHCP_SERVER_KINDS = new Set(['offer', 'ack', 'nak']);

// Tipos que responden a una petición previa: el firewall los deja pasar si existe la sesión
const REPLY_KINDS = new Set(['echo-reply', 'time-exceeded', 'unreachable', 'response', ...DHCP_SERVER_KINDS]);

const TITLES = {
  'arp:request': 'ARP Request',
  'arp:reply': 'ARP Reply',
  'icmp:echo-request': 'Echo Request',
  'icmp:echo-reply': 'Echo Reply',
  'icmp:time-exceeded': 'TTL Exceeded',
  'icmp:unreachable': 'Unreachable',
  'dhcp:discover': 'DHCP Discover',
  'dhcp:offer': 'DHCP Offer',
  'dhcp:request': 'DHCP Request',
  'dhcp:ack': 'DHCP ACK',
  'dhcp:nak': 'DHCP NAK',
  'dhcp:release': 'DHCP Release',
};

let sequence = 0;

// Trama/paquete inmutable. Un router que reescribe cabeceras (MACs, TTL, NAT)
// crea una copia con with(), así cada salto de la traza conserva lo que viajó por ese cable.
export class Packet {
  constructor({
    id,
    protocol,
    kind,
    srcMac = null,
    dstMac = null,
    srcIp = null,
    dstIp = null,
    ttl = 64,
    flowId = null,
    payload = {},
  }) {
    Object.assign(this, { id: id ?? ++sequence, protocol, kind, srcMac, dstMac, srcIp, dstIp, ttl, flowId, payload });
    Object.freeze(this);
  }

  with(changes) {
    return new Packet({ ...this, ...changes });
  }

  get isBroadcast() {
    return this.dstMac === BROADCAST_MAC;
  }

  get isReply() {
    return REPLY_KINDS.has(this.kind);
  }

  get title() {
    return TITLES[`${this.protocol}:${this.kind}`] ?? `${this.protocol.toUpperCase()} ${this.kind}`;
  }

  // Columna "Info" de la captura, con la misma redacción que Wireshark
  get info() {
    const { payload } = this;
    switch (`${this.protocol}:${this.kind}`) {
      case 'arp:request':
        return `Who has ${payload.targetIp}? Tell ${payload.senderIp}`;
      case 'arp:reply':
        return `${payload.senderIp} is at ${this.srcMac.toLowerCase()}`;
      case 'icmp:echo-request':
        return `Echo (ping) request  seq=${payload.seq}, ttl=${this.ttl}`;
      case 'icmp:echo-reply':
        return `Echo (ping) reply    seq=${payload.seq}, ttl=${this.ttl}`;
      case 'icmp:time-exceeded':
        return 'Time-to-live exceeded (Time to live exceeded in transit)';
      case 'icmp:unreachable':
        return 'Destination unreachable (Host unreachable)';
      default:
        if (this.protocol === 'dhcp') {
          const xid = `0x${payload.xid.toString(16).padStart(8, '0')}`;
          return `${this.title} - Transaction ID ${xid}${payload.yiaddr ? ` (IP ofrecida ${payload.yiaddr})` : ''}`;
        }
        return this.title;
    }
  }
}
