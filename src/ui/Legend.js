import { PROTOCOL_COLORS, PROTOCOL_NAMES, CABLE_COLORS, STATUS_COLORS } from '../scene/theme.js';

const SPEEDS = [0.5, 1, 2, 4];

// Leyenda de colores y control de velocidad de la animación
export class Legend {
  constructor(element, { onSpeedChange }) {
    this.el = element;
    this.onSpeedChange = onSpeedChange;

    const protocols = Object.entries(PROTOCOL_COLORS)
      .map(([id, color]) => item(color, PROTOCOL_NAMES[id], 'dot'))
      .join('');

    this.el.innerHTML = `
      <div class="legend__speed" role="group" aria-label="Velocidad">
        ${SPEEDS.map((s) => `<button type="button" data-speed="${s}" aria-pressed="${s === 1}">${s}×</button>`).join('')}
      </div>
      <h3>Paquetes</h3>
      <ul>${protocols}${item(STATUS_COLORS.danger, 'Bloqueado', 'dot')}</ul>
      <h3>Cables</h3>
      <ul>
        ${item('linear-gradient(90deg,#3b82f6,#f59e0b,#a855f7,#10b981)', 'Acceso (color de VLAN)', 'line')}
        ${item(CABLE_COLORS.trunk, 'Trunk 802.1Q', 'line')}
        ${item(CABLE_COLORS.wan, 'WAN', 'line')}
      </ul>
    `;

    this.el.querySelector('.legend__speed').addEventListener('click', (event) => {
      const button = event.target.closest('[data-speed]');
      if (!button) return;
      this.el.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', b === button));
      this.onSpeedChange?.(Number(button.dataset.speed));
    });
  }
}

const item = (color, label, shape) =>
  `<li><span class="legend__${shape}" style="--swatch:${color}"></span>${label}</li>`;
