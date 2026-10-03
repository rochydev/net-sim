import { Emitter } from '../core/Emitter.js';

const PAUSE_BETWEEN_STEPS_MS = 900;

// Ejecuta un escenario paso a paso. Un escenario es una lista de pasos declarativa:
//   { caption: 'Texto que se muestra', run: async (ctx) => { ... } }
// El contexto (ctx) lo construye main.js y es la única forma que tiene un escenario
// de actuar: escribir comandos en la terminal, mover la cámara, tumbar equipos...
//
// En modo guiado, antes de cada paso (salvo el primero) espera a que se llame a next().
// stop() termina el escenario al acabar el paso en curso y cancela su comando.
//
// Eventos: 'start' (scenario), 'step' ({ scenario, index, total, caption }),
//          'waiting' ({ scenario, index, total }), 'end' ({ scenario, stopped })
export class ScenarioRunner {
  constructor(context) {
    this.context = context;
    this.events = new Emitter();
    this.running = null;
    this.guided = false;
    this.stopped = false;
    this.resume = null;
  }

  async run(scenario) {
    if (this.running) return;
    this.running = scenario;
    this.stopped = false;
    this.events.emit('start', scenario);
    try {
      await this.context.prepare();
      const total = scenario.steps.length;
      for (const [index, step] of scenario.steps.entries()) {
        if (index > 0 && this.guided) await this.#waitForNext({ scenario, index, total });
        if (this.stopped) break;
        this.events.emit('step', { scenario, index, total, caption: step.caption });
        await step.run(this.context);
        if (this.stopped) break;
        if (!this.guided) await this.context.wait(PAUSE_BETWEEN_STEPS_MS);
      }
    } finally {
      this.running = null;
      this.resume = null;
      this.events.emit('end', { scenario, stopped: this.stopped });
    }
  }

  next() {
    const resume = this.resume;
    this.resume = null;
    resume?.();
  }

  stop() {
    if (!this.running) return;
    this.stopped = true;
    this.context.abort?.();
    this.next();
  }

  // La promesa se crea antes de avisar: así un next() o stop() lanzado desde el propio
  // evento 'waiting' encuentra ya el resume y no deja el escenario colgado
  #waitForNext(info) {
    const waiting = new Promise((resolve) => (this.resume = resolve));
    this.events.emit('waiting', info);
    return waiting;
  }
}
