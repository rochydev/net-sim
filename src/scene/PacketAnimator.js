import { PacketMesh } from './PacketMesh.js';
import { PROTOCOL_COLORS, STATUS_COLORS } from './theme.js';

const SPEED = 12; // m/s a velocidad 1x
const HOP_MIN = 0.35; // s: ni los cables cortos pasan en un parpadeo...
const HOP_MAX = 1.1; // ...ni los largos se hacen eternos
const FADE = 0.35;

const NOTE_TONES = { policy: 'success', nat: 'info', relay: 'info' };

const OUTCOME_NOTES = {
  dropped: 'danger',
  'ttl-exceeded': 'warning',
  unreachable: 'warning',
};

// Reproduce en 3D las trazas que calcula el motor. Implementa la interfaz de "player"
// que espera el Simulator: play(packet, trace) y wait(ms), ambas devuelven promesas.
//
// Todo el tiempo pasa por el render loop (no hay setTimeout): así la velocidad
// de reproducción afecta por igual a los paquetes y a las pausas entre pings.
export class PacketAnimator {
  constructor(sceneManager, view, effects) {
    this.view = view;
    this.effects = effects;
    this.speed = 1;
    this.tasks = new Set();
    sceneManager.onUpdate((dt) => this.tasks.forEach((task) => task(dt * this.speed)));
  }

  play(_packet, trace) {
    return this.#playNode(trace.root);
  }

  wait(ms) {
    return this.#run(ms / 1000);
  }

  // Avanza de 0 a 1 en `seconds` de tiempo simulado y resuelve al terminar
  #run(seconds, onProgress) {
    return new Promise((resolve) => {
      let elapsed = 0;
      const task = (dt) => {
        elapsed += dt;
        const k = Math.min(elapsed / seconds, 1);
        onProgress?.(k);
        if (k === 1) {
          this.tasks.delete(task);
          resolve();
        }
      };
      this.tasks.add(task);
    });
  }

  // Recorre el árbol de la traza: los hijos de un nodo (copias de un broadcast) viajan a la vez
  async #playNode(node) {
    if (node.hop) this.#arrive(node);
    await Promise.all(
      node.children.map(async (child) => {
        await this.#travel(child);
        await this.#playNode(child);
      }),
    );
  }

  async #travel(node) {
    const { hop, frame } = node;
    const cable = this.view.cables.get(hop.link);
    const color = PROTOCOL_COLORS[frame.protocol] ?? '#ffffff';
    const label = hop.tagged ? `${frame.title} · VLAN ${hop.vlan}` : frame.title;

    const mesh = new PacketMesh(color, label);
    this.view.root.add(mesh.group);

    const duration = Math.min(Math.max(cable.length / SPEED, HOP_MIN), HOP_MAX);
    await this.#run(duration, (k) => mesh.place(cable, hop.from, easeInOut(k)));

    // Un broadcast que llega a quien no le interesa se desvanece en la puerta
    if (node.outcome === 'discarded') await this.#run(FADE, (k) => mesh.setOpacity(1 - k));
    mesh.dispose();
  }

  #arrive(node) {
    const device = this.view.getDevice(node.device);
    for (const note of node.notes) this.effects.note(node.device, note.text, NOTE_TONES[note.type] ?? 'info');

    if (node.outcome === 'delivered' || node.outcome === 'relayed') device.pulse(PROTOCOL_COLORS[node.frame.protocol]);
    const tone = OUTCOME_NOTES[node.outcome];
    if (tone) {
      device.pulse(STATUS_COLORS[tone]);
      this.effects.note(node.device, node.reason, tone);
    }
  }
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
