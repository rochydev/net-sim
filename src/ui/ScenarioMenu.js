import { icon } from './icons.js';

// Lista de escenarios con su botón de ejecución y un botón para restablecer la red
export class ScenarioMenu {
  constructor(element, runner, scenarios, { onReset }) {
    this.el = element;
    this.el.classList.add('scenarios');
    this.el.innerHTML = `
      <ul class="scenarios__list">
        ${scenarios
          .map(
            (s) => `
              <li class="scenario" data-id="${s.id}">
                <h4>${s.title}</h4>
                <p>${s.description}</p>
                <button type="button" class="button" data-run="${s.id}">${icon('play', 14)}Ejecutar</button>
              </li>`,
          )
          .join('')}
      </ul>
      <div class="scenarios__footer">
        <span>Cada escenario parte de la red en su estado inicial.</span>
        <button type="button" class="link-button" data-action="reset">${icon('reset', 13)}Restablecer red</button>
      </div>
    `;

    this.el.addEventListener('click', (event) => {
      const run = event.target.closest('[data-run]');
      if (run) runner.run(scenarios.find((s) => s.id === run.dataset.run));
      if (event.target.closest('[data-action="reset"]')) onReset();
    });

    runner.events.on('start', (scenario) => this.#setRunning(scenario));
    runner.events.on('end', () => this.#setRunning(null));
  }

  #setRunning(scenario) {
    for (const item of this.el.querySelectorAll('.scenario')) {
      item.classList.toggle('is-running', item.dataset.id === scenario?.id);
    }
    this.el.querySelectorAll('button').forEach((b) => (b.disabled = Boolean(scenario)));
  }
}
