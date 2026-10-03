import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Notas flotantes sobre los equipos ("NAT 192.168.10.101 → 203.0.113.2", "Denegado...").
// La animación (subir y desvanecerse) es CSS; aquí solo se crean y se retiran al terminar.
export class Effects {
  constructor(view) {
    this.view = view;
    this.stacks = new Map(); // notas visibles por equipo, para apilarlas sin solaparse
  }

  note(deviceId, text, tone = 'info') {
    const device = this.view.getDevice(deviceId);
    if (!device) return;

    const index = this.stacks.get(deviceId) ?? 0;
    this.stacks.set(deviceId, index + 1);

    const el = document.createElement('div');
    const note = document.createElement('span');
    note.className = `fx-note fx-note--${tone}`;
    note.style.setProperty('--stack', index);
    note.textContent = text;
    el.appendChild(note);

    const label = new CSS2DObject(el);
    label.position.set(0, device.model.height, 0);
    device.root.add(label);

    note.addEventListener(
      'animationend',
      () => {
        device.root.remove(label);
        this.stacks.set(deviceId, Math.max((this.stacks.get(deviceId) ?? 1) - 1, 0));
      },
      { once: true },
    );
  }
}
