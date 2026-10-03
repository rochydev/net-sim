const LINGER_MS = 4000;

// Subtítulo superior que narra el paso actual de un escenario
export class Caption {
  constructor(element, runner) {
    this.el = element;
    this.hideTimer = null;

    runner.events.on('step', ({ index, total, caption }) => this.show(`${index + 1}/${total}`, caption));
    runner.events.on('end', () => {
      this.hideTimer = setTimeout(() => this.hide(), LINGER_MS);
    });
  }

  show(step, text) {
    clearTimeout(this.hideTimer);
    this.el.innerHTML = `<span class="caption__step">${step}</span><span></span>`;
    this.el.lastChild.textContent = text;
    this.el.hidden = false;
  }

  hide() {
    this.el.hidden = true;
  }
}
