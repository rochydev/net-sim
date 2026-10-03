import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildDeviceModel } from './devices/index.js';

// Representación 3D de un dispositivo: modelo + anillo de selección + etiqueta HTML.
// Solo guarda estado visual; la configuración de red vive en topology.js.
export class DeviceMesh {
  constructor(device, { position, accent }) {
    this.id = device.id;
    this.device = device;
    this.accent = accent;
    this.model = buildDeviceModel(device.type, { accent });

    this.root = new THREE.Group();
    this.root.name = device.id;
    this.root.position.copy(position);
    this.root.add(this.model.group);

    // Cada mesh hijo sabe a qué dispositivo pertenece: así el raycaster
    // puede devolver el id aunque el clic caiga en una pieza pequeña
    this.root.traverse((obj) => (obj.userData.deviceId = device.id));

    this.hovered = false;
    this.selected = false;
    this.#createRing();
    this.#createLabel();
    this.root.updateMatrixWorld(true);
  }

  #createRing() {
    // Radio del anillo según el tamaño real del modelo
    const bounds = new THREE.Box3().setFromObject(this.model.group);
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) / 2 + 0.35;

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(radius, radius + 0.07, 64),
      new THREE.MeshBasicMaterial({ color: this.accent, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = bounds.min.y + 0.02;
    this.ring.raycast = () => {}; // el anillo no debe capturar clics
    this.root.add(this.ring);

    // Onda que se expande cuando el equipo recibe un paquete
    this.pulseRing = this.ring.clone();
    this.pulseRing.material = this.ring.material.clone();
    this.root.add(this.pulseRing);
    this.pulseProgress = null;
  }

  pulse(color) {
    this.pulseRing.material.color.set(color);
    this.pulseProgress = 0;
  }

  #createLabel() {
    const { device } = this;
    const el = document.createElement('div');
    el.className = 'device-label';
    el.style.setProperty('--accent', this.accent);
    el.innerHTML = `
      <span class="device-label__marker"></span>
      <span class="device-label__name">${device.name}</span>
      <span class="device-label__ip"></span>
    `;
    this.labelEl = el;
    this.ipEl = el.querySelector('.device-label__ip');
    this.setAddress(device.ip);

    // CSS2DObject: un nodo de la escena cuyo "dibujo" es un elemento del DOM.
    // Three.js escribe style.transform del contenedor en cada frame, por eso
    // los estilos (y animaciones) van en el elemento interior
    const anchor = document.createElement('div');
    anchor.appendChild(el);
    this.label = new CSS2DObject(anchor);
    this.label.position.set(0, this.model.height, 0);
    this.root.add(this.label);
  }

  setHovered(value) {
    this.hovered = value;
    this.labelEl.classList.toggle('is-hovered', value);
  }

  setSelected(value) {
    this.selected = value;
    this.labelEl.classList.toggle('is-selected', value);
  }

  // Solo los equipos de una tarjeta muestran IP; firewall y nube tienen varias interfaces
  setAddress(ip) {
    this.address = ip;
    this.ipEl.textContent = this.device.mac ? (ip ?? 'sin IP') : '';
    this.ipEl.hidden = !this.ipEl.textContent;
  }

  // Equipo caído: se apagan pantallas y LEDs y la etiqueta lo indica
  setUp(up) {
    for (const material of [...this.model.screens, ...this.model.leds]) {
      material.userData.on ??= material.emissiveIntensity;
      material.emissiveIntensity = up ? material.userData.on : 0;
    }
    this.labelEl.classList.toggle('is-down', !up);
  }

  // Refleja el estado del motor: IP actual y si está encendido
  sync(state) {
    this.setAddress(state.ifaces[0]?.ip ?? null);
    this.setUp(state.up);
    if (!state.up) {
      this.ipEl.textContent = 'sin servicio';
      this.ipEl.hidden = false;
    }
  }

  // Punto de conexión del cable en coordenadas de mundo.
  // Si el equipo tiene varios enlaces (switch), se reparten a lo largo de ports.width
  getAnchor(slot = 0, total = 1) {
    const { origin, axis, width = 0 } = this.model.ports;
    const local = new THREE.Vector3(...origin);
    if (axis && total > 1) local[axis] += ((slot + 0.5) / total - 0.5) * width;
    return this.root.localToWorld(local);
  }

  get focusPoint() {
    return this.root.position.clone().add(new THREE.Vector3(0, this.model.height * 0.35, 0));
  }

  update(dt, time) {
    const target = this.selected ? 0.95 : this.hovered ? 0.45 : 0;
    const material = this.ring.material;
    material.opacity += (target - material.opacity) * (1 - Math.exp(-dt * 10));

    const breathe = this.selected ? 1 + Math.sin(time * 4) * 0.04 : 1;
    this.ring.scale.setScalar(breathe);

    if (this.pulseProgress !== null) {
      this.pulseProgress = Math.min(this.pulseProgress + dt / 0.7, 1);
      const k = this.pulseProgress;
      this.pulseRing.scale.setScalar(1 + k * 0.7);
      this.pulseRing.material.opacity = (1 - k) * 0.9;
      if (k === 1) this.pulseProgress = null;
    }
  }
}
