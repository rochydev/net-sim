import { icon } from './icons.js';

const LINGER_MS = 4000;

// Subtítulo superior que narra el paso actual de un escenario.
// En modo guiado ofrece "Siguiente paso"; siempre permite detener el escenario.
export class Caption {
  constructor(element, runner) {
    this.el = element;
    this.hideTimer = null;
    this.el.innerHTML = `
      <span class="caption__step"></span>
      <span class="caption__text"></span>
      <span class="caption__actions">
        <button type="button" class="button button--primary" data-action="next" hidden>${icon('next', 14)}Siguiente paso</button>
        <button type="button" class="icon-button" data-action="stop" title="Detener escenario" aria-label="Detener escenario">${icon('stop', 13)}</button>
      </span>
    `;
    this.step = this.el.querySelector('.caption__step');
    this.text = this.el.querySelector('.caption__text');
    this.nextButton = this.el.querySelector('[data-action="next"]');
    this.stopButton = this.el.querySelector('[data-action="stop"]');

    this.el.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'next') runner.next();
      if (action === 'stop') runner.stop();
    });

    runner.events.on('step', ({ index, total, caption }) => {
      this.nextButton.hidden = true;
      this.show(`${index + 1}/${total}`, caption);
    });
    runner.events.on('waiting', ({ index, total }) => {
      this.step.textContent = `${index}/${total}`;
      this.nextButton.hidden = false;
      this.nextButton.focus();
    });
    runner.events.on('end', ({ stopped }) => {
      this.nextButton.hidden = true;
      this.stopButton.hidden = true;
      if (stopped) this.text.textContent = 'Escenario detenido.';
      this.hideTimer = setTimeout(() => this.hide(), stopped ? 1500 : LINGER_MS);
    });
  }

  show(step, text) {
    clearTimeout(this.hideTimer);
    this.step.textContent = step;
    this.text.textContent = text;
    this.stopButton.hidden = false;
    this.el.hidden = false;
  }

  hide() {
    this.el.hidden = true;
  }
}
