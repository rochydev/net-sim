const FAILURES = new Set(['dropped', 'ttl-exceeded', 'unreachable']);

// Un equipo por el que pasa la trama. Es un árbol y no una lista porque un
// broadcast se replica: el switch lo reenvía por varios puertos a la vez.
//
// outcome:
//   delivered     el equipo acepta la trama (es para él)
//   discarded     la recibe pero no es para él (broadcast ajeno, MAC de otro)
//   dropped       se pierde: política del firewall, equipo apagado, cable suelto
//   ttl-exceeded  un router la descarta por TTL agotado
//   unreachable   un router no encuentra el destino
export class TraceNode {
  constructor(device, hop, frame, time) {
    this.device = device;
    this.hop = hop; // { link, from, to, vlan, tagged } — null en el origen
    this.frame = frame; // la trama tal como llegó a este equipo
    this.time = time; // latencia acumulada en ms
    this.children = [];
    this.notes = [];
    this.outcome = null;
    this.reason = null;
    this.data = {};
  }

  addHop(hop, frame, latency) {
    const child = new TraceNode(hop.to, hop, frame, this.time + latency);
    this.children.push(child);
    return child;
  }

  addLatency(ms) {
    this.time += ms;
  }

  note(type, text) {
    this.notes.push({ type, text });
  }

  end(outcome, reason = null, data = {}) {
    this.outcome = outcome;
    this.reason = reason;
    this.data = data;
    return this;
  }
}

export class Trace {
  constructor(root) {
    this.root = root;
  }

  *[Symbol.iterator]() {
    const stack = [this.root];
    while (stack.length) {
      const node = stack.pop();
      yield node;
      stack.push(...[...node.children].reverse());
    }
  }

  get nodes() {
    return [...this];
  }

  get delivered() {
    return this.nodes.filter((n) => n.outcome === 'delivered');
  }

  deliveredTo(deviceId) {
    return this.nodes.find((n) => n.outcome === 'delivered' && n.device === deviceId) ?? null;
  }

  get failure() {
    return this.nodes.find((n) => FAILURES.has(n.outcome)) ?? null;
  }

  // Lista de equipos recorridos hasta el primer nodo final (útil en tests y depuración)
  get path() {
    const path = [];
    let node = this.root;
    while (node) {
      path.push(node.device);
      node = node.children[0];
    }
    return path;
  }
}
