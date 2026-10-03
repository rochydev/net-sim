export const BROADCAST_MAC = 'FF:FF:FF:FF:FF:FF';
export const BROADCAST_IP = '255.255.255.255';

// Tipos que responden a una petición previa: el firewall los deja pasar si existe la sesión
const REPLY_KINDS = new Set(['echo-reply', 'time-exceeded', 'unreachable', 'response']);

const TITLES = {
  'arp:request': 'ARP Request',
  'arp:reply': 'ARP Reply',
  'icmp:echo-request': 'Echo Request',
  'icmp:echo-reply': 'Echo Reply',
  'icmp:time-exceeded': 'TTL Exceeded',
  'icmp:unreachable': 'Unreachable',
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
        return this.title;
    }
  }
}
