import { PROTOCOL_COLORS, PROTOCOL_NAMES } from '../scene/theme.js';

const MAX_ROWS = 300;

// Captura de tramas al estilo Wireshark: una fila por cada trama que un equipo emite.
// Escucha los eventos del simulador; no sabe nada de la escena.
export class PacketCapture {
  constructor(element, sim) {
    this.el = element;
    this.engine = sim.engine;
    this.count = 0;
    this.startedAt = null;
    this.onChange = null;

    this.el.classList.add('capture');
    this.el.innerHTML = `
      <div class="capture__bar">
        <span>Captura en todas las interfaces</span>
        <button type="button" class="link-button" data-action="clear">Vaciar</button>
      </div>
      <div class="capture__scroll">
        <table class="capture__table">
          <thead><tr><th>N.º</th><th>Tiempo</th><th>Origen</th><th>Destino</th><th>Protocolo</th><th>Info</th></tr></thead>
          <tbody></tbody>
        </table>
        <p class="capture__empty">Lanza un ping desde la terminal para ver tráfico.</p>
      </div>
    `;
    this.body = this.el.querySelector('tbody');
    this.scroll = this.el.querySelector('.capture__scroll');
    this.el.querySelector('[data-action="clear"]').addEventListener('click', () => this.clear());

    sim.events.on('trace', ({ packet, trace }) => this.#add(packet, trace));
  }

  clear() {
    this.body.replaceChildren();
    this.count = 0;
    this.startedAt = null;
    this.el.classList.remove('has-rows');
    this.onChange?.(0);
  }

  #add(packet, trace) {
    const now = performance.now();
    this.startedAt ??= now;
    this.count++;

    const failure = trace.failure;
    const row = document.createElement('tr');
    row.style.setProperty('--proto', PROTOCOL_COLORS[packet.protocol] ?? '#94a3b8');
    if (failure?.outcome === 'dropped') row.classList.add('is-dropped');

    const where = failure?.outcome === 'dropped' ? ` [descartado en ${this.engine.device(failure.device).name}]` : '';
    const cells = [
      this.count,
      ((now - this.startedAt) / 1000).toFixed(3),
      packet.srcIp ?? packet.srcMac.toLowerCase(),
      packet.dstIp ?? (packet.isBroadcast ? 'Broadcast' : packet.dstMac.toLowerCase()),
      PROTOCOL_NAMES[packet.protocol] ?? packet.protocol.toUpperCase(),
      packet.info + where,
    ];
    for (const value of cells) {
      const td = document.createElement('td');
      td.textContent = value;
      row.appendChild(td);
    }

    const stick = this.scroll.scrollTop + this.scroll.clientHeight >= this.scroll.scrollHeight - 8;
    this.body.appendChild(row);
    while (this.body.rows.length > MAX_ROWS) this.body.deleteRow(0);
    if (stick) this.scroll.scrollTop = this.scroll.scrollHeight;

    this.el.classList.add('has-rows');
    this.onChange?.(this.count);
  }
}
