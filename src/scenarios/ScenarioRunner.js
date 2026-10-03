import { Emitter } from '../core/Emitter.js';

const PAUSE_BETWEEN_STEPS_MS = 900;

// Ejecuta un escenario paso a paso. Un escenario es una lista de pasos declarativa:
//   { caption: 'Texto que se muestra', run: async (ctx) => { ... } }
// El contexto (ctx) lo construye main.js y es la única forma que tiene un escenario
// de actuar: escribir comandos en la terminal, mover la cámara, tumbar equipos...
//
// Eventos: 'start' (scenario), 'step' ({ scenario, index, total, caption }), 'end' (scenario)
export class ScenarioRunner {
  constructor(context) {
    this.context = context;
    this.events = new Emitter();
    this.running = null;
  }

  async run(scenario) {
    if (this.running) return;
    this.running = scenario;
    this.events.emit('start', scenario);
    try {
      await this.context.prepare();
      const total = scenario.steps.length;
      for (const [index, step] of scenario.steps.entries()) {
        this.events.emit('step', { scenario, index, total, caption: step.caption });
        await step.run(this.context);
        await this.context.wait(PAUSE_BETWEEN_STEPS_MS);
      }
    } finally {
      this.running = null;
      this.events.emit('end', scenario);
    }
  }
}
