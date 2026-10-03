import { prefixToMask, isApipa } from '../sim/ip.js';
import { canRunShell } from '../sim/shell/Shell.js';
import { DEVICE_TYPE_LABELS } from '../config/topology.js';
import { icon, DEVICE_ICONS } from './icons.js';

// Panel lateral con la configuración del dispositivo seleccionado.
// Lee el estado del motor (no la topología estática) para reflejar cambios en vivo:
// IPs obtenidas por DHCP, equipos caídos, políticas activadas, concesiones...
export class DevicePanel {
  constructor(element, engine, { onClose, onOpenTerminal, onTogglePolicy, onTogglePower, onToggleLink } = {}) {
    this.el = element;
    this.engine = engine;
    this.topology = engine.topology;
    this.deviceId = null;

    this.el.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'close') onClose?.();
      if (action === 'terminal') onOpenTerminal?.(this.deviceId);
      if (action === 'power') onTogglePower?.(this.deviceId);
      const link = event.target.closest('[data-link]');
      if (link) onToggleLink?.(link.dataset.link);
    });
    this.el.addEventListener('change', (event) => {
      const toggle = event.target.closest('[data-policy]');
      if (toggle) onTogglePolicy?.(this.deviceId, Number(toggle.dataset.policy), toggle.checked);
    });
  }

  show(deviceId) {
    this.deviceId = deviceId;
    this.#render();
    // Reinicia la animación de entrada en cada selección
    this.el.classList.remove('is-entering');
    void this.el.offsetWidth;
    this.el.classList.add('is-entering');
  }

  // Vuelve a pintar el equipo actual sin animación (cuando cambia su estado)
  refresh(deviceId = this.deviceId) {
    if (deviceId && deviceId === this.deviceId && !this.el.hidden) this.#render();
  }

  hide() {
    this.deviceId = null;
    this.el.hidden = true;
  }

  #render() {
    const state = this.engine.devices.get(this.deviceId);
    if (!state) return this.hide();

    const device = state.config;
    const vlan = this.#vlan(device.vlan);
    this.el.style.setProperty(
      '--accent',
      device.type === 'firewall' ? 'var(--danger)' : (vlan?.color ?? 'var(--accent)'),
    );
    this.el.innerHTML = `
      <header class="panel__header">
        <span class="panel__icon">${icon(DEVICE_ICONS[device.type], 20)}</span>
        <div class="panel__heading">
          <span class="panel__type">${DEVICE_TYPE_LABELS[device.type]}</span>
          <h2>${device.name}</h2>
          ${device.model || device.description ? `<p class="panel__model">${device.model ?? device.description}</p>` : ''}
        </div>
        <button class="icon-button" data-action="close" aria-label="Cerrar">${icon('close', 16)}</button>
      </header>
      <div class="panel__meta">
        <span class="status ${state.up ? '' : 'is-down'}">${state.up ? 'En línea' : 'Sin servicio'}</span>
        <span class="panel__actions">
          ${canRunShell(state) && state.up ? `<button type="button" class="button" data-action="terminal">${icon('terminal', 14)}Terminal</button>` : ''}
          ${
            state.type === 'cloud'
              ? ''
              : `<button type="button" class="button ${state.up ? 'button--danger' : ''}" data-action="power">${icon('power', 14)}${state.up ? 'Apagar' : 'Encender'}</button>`
          }
        </span>
      </div>
      ${this.#body(state, vlan)}
      ${this.#links(device)}
    `;
    this.el.hidden = false;
  }

  #vlan(id) {
    return this.topology.vlans.find((v) => v.id === id);
  }

  #vlanChip(id) {
    const vlan = this.#vlan(id);
    return vlan ? `<span class="chip" style="--chip:${vlan.color}">VLAN ${vlan.id} · ${vlan.name}</span>` : '—';
  }

  #body(state, vlan) {
    switch (state.type) {
      case 'cloud':
        return section('Hosts públicos', table(state.hosts.map((h) => [h.name, mono(h.ip)])));
      case 'firewall':
        return this.#interfaces(state) + this.#policies(state);
      default:
        return this.#addressing(state, vlan) + this.#roles(state) + this.#leases(state);
    }
  }

  #addressing(state, vlan) {
    const iface = state.ifaces[0];
    const dhcp = state.config.addressing === 'dhcp';
    const none = '<span class="muted">—</span>';
    let assignment = dhcp ? 'DHCP' : 'Estática';
    if (dhcp && !iface.ip) assignment = '<span class="muted">DHCP · sin concesión</span>';
    if (isApipa(iface.ip)) assignment = '<span class="chip chip--deny">APIPA</span>';

    const rows = [
      ['Dirección IP', iface.ip ? mono(iface.ip) : none],
      ['Máscara', iface.prefix ? mono(prefixToMask(iface.prefix)) : none],
      ['Puerta de enlace', iface.gateway ? mono(iface.gateway) : none],
      ['DNS', iface.dns ? mono(iface.dns) : none],
      ['MAC', mono(iface.mac)],
      ['VLAN', vlan ? this.#vlanChip(vlan.id) : '—'],
    ];
    if (state.config.addressing) rows.push(['Asignación', assignment]);
    return section(state.type === 'switch' ? 'Gestión' : 'Configuración IP', table(rows));
  }

  #roles(state) {
    if (!state.config.roles?.length) return '';
    return section(
      'Roles',
      `<div class="chips">${[...state.services].map(([role, running]) => (running ? `<span class="chip chip--accept">${role}</span>` : `<span class="chip chip--deny">${role} · detenido</span>`)).join('')}</div>`,
    );
  }

  #leases(state) {
    if (!state.services.has('DHCP')) return '';
    const names = new Map([...this.engine.devices.values()].map((d) => [d.ifaces[0]?.mac, d.name]));
    const rows = [...state.leases].map(([mac, lease]) => [
      mono(lease.ip),
      `${names.get(mac) ?? 'Desconocido'}<small>${mac}</small>`,
      lease.active ? '<span class="chip chip--accept">Activa</span>' : '<span class="chip chip--off">Libre</span>',
    ]);
    return section('Concesiones DHCP', table(rows));
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
      `${p.name}<small>${p.srcintf.join(', ')} → ${p.dstintf.join(', ')} · ${p.service.join(', ')}${p.nat ? ' · NAT' : ''}</small><small>${hits(p.hits)}</small>`,
      `<label class="toggle" title="${p.enabled ? 'Desactivar' : 'Activar'} la política #${p.id}">
        <input type="checkbox" data-policy="${p.id}" aria-label="Política #${p.id}: ${p.name}" ${p.enabled ? 'checked' : ''} />
        <span class="toggle__track"></span>
        <span class="toggle__label">${p.enabled ? p.action.toUpperCase() : 'OFF'}</span>
      </label>`,
    ]);
    rows.push([
      mono('#0'),
      `Política implícita<small>todo lo demás</small><small>${hits(state.implicitDenyHits)}</small>`,
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
      const up = this.engine.isLinkUp(link.id);
      const plug = `<button type="button" class="icon-button" data-link="${link.id}" title="${up ? 'Desconectar' : 'Conectar'} el cable" aria-label="${up ? 'Desconectar' : 'Conectar'} el cable de ${own.port}">${icon(up ? 'unplug' : 'plug', 14)}</button>`;
      return [
        mono(own.port),
        `${peer.name}<small>${other.port}</small>`,
        up ? mode : '<span class="chip chip--deny">Desconectado</span>',
        plug,
      ];
    });
    return section(device.type === 'switch' ? 'Puertos' : 'Enlaces', table(rows));
  }
}

const mono = (text) => `<code>${text}</code>`;
const hits = (count) => (count === 1 ? '1 acierto' : `${count} aciertos`);
const section = (title, content) => `<section class="panel__section"><h3>${title}</h3>${content}</section>`;
const table = (rows, className = 'kv') =>
  `<table class="${className}">${rows.map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
