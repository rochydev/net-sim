import { Shell, canRunShell } from '../sim/shell/Shell.js';

const WARNING = /agotado|inaccesible|caducado|no se reconoce|no pudo encontrar|Error general/;
const MAX_SUGGESTIONS = 7;
const DEVICE_ORDER = ['pc', 'laptop', 'server'];

// Consola del equipo elegido. Solo pinta: los comandos los ejecuta el Shell del simulador.
// Cada equipo conserva su propio historial de pantalla, como si fueran ventanas distintas.
export class Terminal {
  constructor(element, sim) {
    this.el = element;
    this.sim = sim;
    this.shell = new Shell(sim);
    // Puestos de usuario primero: es desde donde suele empezar una incidencia
    this.devices = [...sim.engine.devices.values()]
      .filter(canRunShell)
      .sort((a, b) => DEVICE_ORDER.indexOf(a.type) - DEVICE_ORDER.indexOf(b.type));
    this.screens = new Map();
    this.history = [];
    this.historyIndex = 0;
    this.running = null;

    this.#build();
    this.setDevice(this.devices[0].id);
  }

  get deviceId() {
    return this.select.value;
  }

  canUse(deviceId) {
    return this.devices.some((d) => d.id === deviceId);
  }

  setDevice(deviceId) {
    if (this.running || !this.canUse(deviceId)) return;
    if (deviceId === this.deviceId && this.screens.has(deviceId)) return;
    this.select.value = deviceId;
    if (!this.screens.has(deviceId)) {
      this.screens.set(
        deviceId,
        this.shell.banner().map((text) => ({ text })),
      );
    }
    this.prompt.textContent = this.shell.prompt(deviceId);
    this.#renderScreen();
    this.#renderSuggestions();
  }

  focus() {
    this.input.focus();
  }

  // Mientras un escenario usa la terminal, el usuario no puede escribir ni cambiar de equipo
  setLocked(locked) {
    this.locked = locked;
    this.#setBusy(locked || Boolean(this.running));
  }

  async run(line) {
    if (this.running) return;
    const deviceId = this.deviceId;
    this.#print(deviceId, `${this.shell.prompt(deviceId)}${line}`, 'command');
    if (line.trim()) this.history.push(line);
    this.historyIndex = this.history.length;

    if (line.trim().toLowerCase() === 'cls') {
      this.screens.set(deviceId, []);
      return this.#renderScreen();
    }

    this.running = new AbortController();
    this.#setBusy(true);
    try {
      for await (const text of this.shell.run(deviceId, line, { signal: this.running.signal })) {
        this.#print(deviceId, text);
      }
    } finally {
      this.#print(deviceId, '');
      this.running = null;
      this.#setBusy(Boolean(this.locked));
    }
  }

  #build() {
    this.el.classList.add('terminal');
    this.el.innerHTML = `
      <div class="terminal__bar">
        <label>Equipo <select class="terminal__device"></select></label>
        <span class="terminal__status"></span>
      </div>
      <div class="terminal__screen" role="log" aria-live="polite"></div>
      <form class="terminal__line" autocomplete="off">
        <span class="terminal__prompt"></span>
        <input class="terminal__input" spellcheck="false" aria-label="Comando" />
      </form>
      <div class="terminal__suggestions"></div>
    `;
    this.select = this.el.querySelector('.terminal__device');
    this.screen = this.el.querySelector('.terminal__screen');
    this.prompt = this.el.querySelector('.terminal__prompt');
    this.input = this.el.querySelector('.terminal__input');
    this.status = this.el.querySelector('.terminal__status');
    this.suggestions = this.el.querySelector('.terminal__suggestions');

    this.select.innerHTML = this.devices.map((d) => `<option value="${d.id}">${d.name}</option>`).join('');
    this.select.addEventListener('change', () => this.setDevice(this.select.value));

    this.el.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.running || this.locked) return;
      const line = this.input.value;
      this.input.value = '';
      this.run(line);
    });
    this.input.addEventListener('keydown', (event) => this.#onKey(event));
    this.screen.addEventListener('click', () => this.focus());

    this.suggestions.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-command]');
      if (chip) this.run(chip.dataset.command);
    });
  }

  #onKey(event) {
    if (event.ctrlKey && event.key.toLowerCase() === 'c' && this.running) {
      event.preventDefault();
      this.running.abort();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const step = event.key === 'ArrowUp' ? -1 : 1;
      this.historyIndex = Math.min(Math.max(this.historyIndex + step, 0), this.history.length);
      this.input.value = this.history[this.historyIndex] ?? '';
    }
  }

  #print(deviceId, text, kind) {
    const line = { text, kind: kind ?? (WARNING.test(text) ? 'warning' : undefined) };
    this.screens.get(deviceId).push(line);
    if (deviceId === this.deviceId) {
      this.screen.appendChild(renderLine(line));
      this.screen.scrollTop = this.screen.scrollHeight;
    }
  }

  #renderScreen() {
    this.screen.replaceChildren(...this.screens.get(this.deviceId).map(renderLine));
    this.screen.scrollTop = this.screen.scrollHeight;
  }

  #renderSuggestions() {
    this.suggestions.innerHTML = this.#suggestionsFor(this.deviceId)
      .map((command) => `<button type="button" class="command-chip" data-command="${command}">${command}</button>`)
      .join('');
  }

  // Atajos pensados para enseñar algo: la puerta de enlace, un vecino, otra VLAN, Internet...
  #suggestionsFor(deviceId) {
    const { engine } = this.sim;
    const self = engine.device(deviceId);
    const iface = self.ifaces[0];
    const others = [...engine.devices.values()].filter((d) => d.id !== deviceId && d.ifaces[0]?.ip);
    const neighbour = others.find((d) => d.ifaces[0].vlan === iface.vlan && d.role === 'host');
    const server = others.find((d) => d.config.roles?.includes('DNS'));
    const industrial = others.find((d) => d.type === 'industrial');

    const commands = [
      'ipconfig',
      iface.gateway && `ping ${iface.gateway}`,
      neighbour && `ping ${neighbour.ifaces[0].ip}`,
      server && `ping ${server.ifaces[0].ip}`,
      industrial && `ping ${industrial.ifaces[0].ip}`,
      'ping 8.8.8.8',
      'tracert 8.8.8.8',
      'arp -a',
    ].filter(Boolean);
    return [...new Set(commands)].slice(0, MAX_SUGGESTIONS);
  }

  #setBusy(busy) {
    this.el.classList.toggle('is-busy', busy);
    this.select.disabled = busy;
    this.status.textContent = this.locked ? 'Escenario en curso' : busy ? 'Ejecutando… (Ctrl+C para cancelar)' : '';
    this.input.readOnly = busy;
    this.suggestions.querySelectorAll('button').forEach((b) => (b.disabled = busy));
  }
}

function renderLine({ text, kind }) {
  const div = document.createElement('div');
  div.className = kind ? `terminal__text terminal__text--${kind}` : 'terminal__text';
  div.textContent = text || ' ';
  return div;
}
