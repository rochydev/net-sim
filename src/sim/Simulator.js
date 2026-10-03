import { Emitter } from '../core/Emitter.js';
import { NetworkEngine } from './NetworkEngine.js';

// Reproductor por defecto: todo ocurre al instante (tests, o sin escena)
const instantPlayer = {
  play: async () => {},
  wait: async () => {},
};

// Orquesta los protocolos sobre el motor. Cada envío:
//   1. el motor calcula la traza completa (síncrono, puro)
//   2. se notifica a quien escuche (captura de paquetes)
//   3. el "player" la reproduce y el protocolo espera a que termine
// El player lo inyecta main.js; el simulador no sabe que existe una escena 3D.
//
// Eventos: 'trace' ({ packet, trace, from }), 'device' ({ id }), 'link' ({ id }), 'reset'
export class Simulator {
  constructor(topology, { random = Math.random } = {}) {
    this.topology = topology;
    this.engine = new NetworkEngine(topology);
    this.events = new Emitter();
    this.player = instantPlayer;
    this.random = random;
  }

  setPlayer(player) {
    this.player = player ?? instantPlayer;
  }

  async send(packet, fromId) {
    const trace = this.engine.trace(packet, fromId);
    this.events.emit('trace', { packet, trace, from: fromId });
    // Los firewalls que han evaluado políticas han cambiado sus contadores
    for (const node of trace) {
      if (node.data.policy !== undefined || node.notes.some((n) => n.type === 'policy'))
        this.deviceChanged(node.device);
    }
    await this.player.play(packet, trace);
    return trace;
  }

  wait(ms) {
    return this.player.wait(ms);
  }

  // Un protocolo ha cambiado la configuración de un equipo (p. ej. nueva IP por DHCP)
  deviceChanged(deviceId) {
    this.events.emit('device', { id: deviceId });
  }

  setDeviceUp(deviceId, up) {
    this.engine.device(deviceId).up = up;
    this.deviceChanged(deviceId);
  }

  setServiceRunning(deviceId, service, running) {
    this.engine.setServiceRunning(deviceId, service, running);
    this.deviceChanged(deviceId);
  }

  setPolicyEnabled(deviceId, policyId, enabled) {
    this.engine.setPolicyEnabled(deviceId, policyId, enabled);
    this.deviceChanged(deviceId);
  }

  setLinkUp(linkId, up) {
    this.engine.setLinkUp(linkId, up);
    this.events.emit('link', { id: linkId });
  }

  reset() {
    this.engine.reset();
    this.events.emit('reset');
  }
}
