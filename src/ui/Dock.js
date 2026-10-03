// Panel inferior con pestañas (Terminal / Captura) que se puede plegar
// para dejar la escena despejada, por ejemplo al grabar un vídeo.
export class Dock {
  constructor(element, tabs) {
    this.el = element;
    this.tabs = tabs;

    this.el.innerHTML = `
      <div class="dock__tabs" role="tablist">
        ${tabs
          .map(
            (tab) =>
              `<button type="button" role="tab" class="dock__tab" data-tab="${tab.id}">${tab.label}<span class="dock__badge" hidden></span></button>`,
          )
          .join('')}
        <button type="button" class="dock__toggle" aria-label="Plegar panel" title="Plegar panel">▾</button>
      </div>
      <div class="dock__body"></div>
    `;
    const body = this.el.querySelector('.dock__body');
    for (const tab of tabs) {
      tab.content.classList.add('dock__pane');
      body.appendChild(tab.content);
    }

    this.el.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-tab]');
      if (tab) this.select(tab.dataset.tab);
      if (event.target.closest('.dock__toggle')) this.el.classList.toggle('is-collapsed');
    });
    this.select(tabs[0].id);
  }

  select(id) {
    this.el.classList.remove('is-collapsed');
    for (const tab of this.tabs) {
      const active = tab.id === id;
      tab.content.hidden = !active;
      this.el.querySelector(`[data-tab="${tab.id}"]`).setAttribute('aria-selected', active);
    }
  }

  setBadge(id, value) {
    const badge = this.el.querySelector(`[data-tab="${id}"] .dock__badge`);
    badge.hidden = !value;
    badge.textContent = value;
  }
}
