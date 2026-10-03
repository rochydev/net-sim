import { prefixToMask } from '../sim/ip.js';
import { canRunShell } from '../sim/shell/Shell.js';
import { DEVICE_TYPE_LABELS } from '../config/topology.js';

// Panel lateral con la configuración del dispositivo seleccionado.
// Lee el estado del motor (no la topología estática) para reflejar cambios en vivo:
// equipos caídos, políticas activadas, etc.
export class DevicePanel {
  constructor(element, engine, { onClose, onOpenTerminal } = {}) {
    this.el = element;
    this.engine = engine;
    this.topology = engine.topology;
    this.deviceId = null;

    this.el.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'close') onClose?.();
      if (action === 'terminal') onOpenTerminal?.(this.deviceId);
    });
  }

  show(deviceId) {
    const state = this.engine.devices.get(deviceId);
    if (!state) return this.hide();
    this.deviceId = deviceId;

    const device = state.config;
    const vlan = this.#vlan(device.vlan);
    this.el.style.setProperty('--accent', device.type === 'firewall' ? '#ef4444' : (vlan?.color ?? '#60a5fa'));
    this.el.innerHTML = `
      <header class="panel__header">
        <div>
          <span class="panel__type">${DEVICE_TYPE_LABELS[device.type]}</span>
          <h2>${device.name}</h2>
          ${device.model || device.description ? `<p class="panel__model">${device.model ?? device.description}</p>` : ''}
        </div>
        <button class="panel__close" data-action="close" aria-label="Cerrar">×</button>
      </header>
      <div class="panel__meta">
        <span class="panel__status ${state.up ? '' : 'is-down'}"><span class="status-dot"></span>${state.up ? 'En línea' : 'Sin servicio'}</span>
        ${canRunShell(state) ? '<button type="button" class="chip-button" data-action="terminal">Abrir terminal</button>' : ''}
      </div>
      ${this.#body(state, vlan)}
      ${this.#links(device)}
    `;
    this.el.hidden = false;
    // Reinicia la animación de entrada en cada selección
    this.el.classList.remove('is-entering');
    void this.el.offsetWidth;
    this.el.classList.add('is-entering');
  }

  hide() {
    this.deviceId = null;
    this.el.hidden = true;
  }

  #vlan(id) {
    return this.topology.vlans.find((v) => v.id === id);
  }

  #vlanChip(id) {
    const vlan = this.#vlan(id);
    return vlan ? `<span class="chip" style="--chip:${vlan.color}">VLAN ${vlan.id} · ${vlan.name}</span>` : '—';
  }

  #body(state, vlan) {
    const device = state.config;
    switch (device.type) {
      case 'cloud':
        return section('Hosts públicos', table(state.hosts.map((h) => [h.name, mono(h.ip)])));
      case 'firewall':
        return this.#interfaces(state) + this.#policies(state);
      default: {
        const rows = [
          ['Dirección IP', mono(device.ip)],
          ['Máscara', mono(prefixToMask(device.prefix))],
          ['Puerta de enlace', mono(device.gateway)],
          ['DNS', device.dns ? mono(device.dns) : '<span class="muted">sin configurar</span>'],
          ['MAC', mono(device.mac)],
          ['VLAN', vlan ? this.#vlanChip(vlan.id) : '—'],
        ];
        if (device.addressing) rows.push(['Asignación', device.addressing === 'dhcp' ? 'DHCP' : 'Estática']);
        const roles = device.roles?.length
          ? section(
              'Roles',
              `<div class="chips">${device.roles.map((r) => `<span class="chip">${r}</span>`).join('')}</div>`,
            )
          : '';
        return section(device.type === 'switch' ? 'Gestión' : 'Configuración IP', table(rows)) + roles;
      }
    }
  }

  #interfaces(state) {
    return section(
      'Interfaces',
      table(
        state.ifaces.map((i) => [
          mono(i.name),
          `${mono(`${i.ip}/${i.prefix}`)}${i.dhcpRelay ? `<small>DHCP relay → ${i.dhcpRelay}</small>` : ''}`,
          i.vlan ? this.#vlanChip(i.vlan) : '<span class="chip chip--wan">WAN</span>',
        ]),
      ),
    );
  }

  #policies(state) {
    const rows = state.policies.map((p) => [
      mono(`#${p.id}`),
      `${p.name}<small>${p.srcintf.join(', ')} → ${p.dstintf.join(', ')} · ${p.service.join(', ')}${p.nat ? ' · NAT' : ''}</small>`,
      p.enabled
        ? `<span class="chip chip--accept">${p.action.toUpperCase()}</span>`
        : '<span class="chip chip--off">DESACTIVADA</span>',
    ]);
    rows.push([
      mono('#0'),
      'Política implícita<small>todo lo demás</small>',
      '<span class="chip chip--deny">DENY</span>',
    ]);
    return section('Políticas de firewall', table(rows, 'kv kv--policies'));
  }

  #links(device) {
    const links = this.topology.links.filter((l) => l.a.device === device.id || l.b.device === device.id);
    const rows = links.map((link) => {
      const [own, other] = link.a.device === device.id ? [link.a, link.b] : [link.b, link.a];
      const peer = this.engine.devices.get(other.device).config;
      const mode =
        link.mode === 'trunk'
          ? `<span class="chip chip--trunk">Trunk ${link.vlans.join(',')}</span>`
          : link.mode === 'wan'
            ? '<span class="chip chip--wan">WAN</span>'
            : this.#vlanChip(link.vlan);
      return [mono(own.port), `${peer.name}<small>${other.port}</small>`, mode];
    });
    return section(device.type === 'switch' ? 'Puertos' : 'Enlaces', table(rows));
  }
}

const mono = (text) => `<code>${text}</code>`;
const section = (title, content) => `<section class="panel__section"><h3>${title}</h3>${content}</section>`;
const table = (rows, className = 'kv') =>
  `<table class="${className}">${rows.map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
