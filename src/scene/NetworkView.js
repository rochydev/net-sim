import * as THREE from 'three';
import { Emitter } from '../core/Emitter.js';
import { DeviceMesh } from './DeviceMesh.js';
import { Cable } from './Cable.js';
import { createZone } from './Zone.js';
import { CABLE_COLORS } from './theme.js';

const TYPE_ACCENTS = {
  cloud: '#60a5fa',
  firewall: '#ef4444',
  switch: '#cbd5e1',
};
const LANE_GAP = 0.13;

// Traduce la topología (datos) a objetos 3D y gestiona la interacción con ellos.
// Eventos: 'select' (id | null)
export class NetworkView {
  constructor(sceneManager, topology, layout) {
    this.sm = sceneManager;
    this.topology = topology;
    this.layout = layout;
    this.events = new Emitter();
    this.devices = new Map();
    this.cables = new Map();
    this.selectedId = null;
    this.hoveredId = null;

    this.root = new THREE.Group();
    this.sm.scene.add(this.root);

    this.#buildZones();
    this.#buildDevices();
    this.#buildCables();
    this.#setupPointer();

    this.sm.onUpdate((dt, time) => this.devices.forEach((d) => d.update(dt, time)));
  }

  vlan(id) {
    return this.topology.vlans.find((v) => v.id === id);
  }

  accentFor(device) {
    return TYPE_ACCENTS[device.type] ?? this.vlan(device.vlan)?.color ?? '#94a3b8';
  }

  getDevice(id) {
    return this.devices.get(id);
  }

  #buildZones() {
    for (const zone of this.layout.zones) {
      this.root.add(createZone(zone, this.vlan(zone.vlan)));
    }
  }

  #buildDevices() {
    for (const device of this.topology.devices) {
      const [x, z] = this.layout.devices[device.id];
      const y = this.layout.elevation?.[device.id] ?? 0;
      const mesh = new DeviceMesh(device, { position: new THREE.Vector3(x, y, z), accent: this.accentFor(device) });
      mesh.labelEl.addEventListener('click', () => this.select(device.id));
      this.devices.set(device.id, mesh);
      this.root.add(mesh.root);
    }
  }

  // Ruta tipo "bandeja de cables": baja al suelo, avanza en z hasta su carril,
  // recorre x y vuelve a subir al otro equipo. Los carriles evitan solapes.
  #buildCables() {
    const { links } = this.topology;
    const h = this.layout.cableHeight;
    const posX = (id) => this.devices.get(id).root.position.x;

    // Ordenar los puertos de cada equipo según la x del otro extremo evita cruces
    const slots = new Map();
    for (const device of this.devices.keys()) {
      const own = links.filter((l) => l.a.device === device || l.b.device === device);
      own.sort((l1, l2) => posX(otherEnd(l1, device)) - posX(otherEnd(l2, device)));
      own.forEach((l, i) => slots.set(`${l.id}:${device}`, { slot: i, total: own.length }));
    }

    // Los enlaces que recorren más distancia en x usan el carril más cercano al origen
    const lanes = [...links].sort(
      (l1, l2) => Math.abs(posX(l2.b.device) - posX(l2.a.device)) - Math.abs(posX(l1.b.device) - posX(l1.a.device)),
    );

    links.forEach((link, index) => {
      const sa = slots.get(`${link.id}:${link.a.device}`);
      const sb = slots.get(`${link.id}:${link.b.device}`);
      const a = this.devices.get(link.a.device).getAnchor(sa.slot, sa.total);
      const b = this.devices.get(link.b.device).getAnchor(sb.slot, sb.total);

      const y = h + index * 0.004; // pequeña diferencia de altura para que no parpadeen al cruzarse
      const laneZ = Math.min(a.z, b.z) + Math.abs(a.z - b.z) / 2 + lanes.indexOf(link) * LANE_GAP - LANE_GAP * 2;
      const points = [
        a,
        new THREE.Vector3(a.x, y, a.z),
        new THREE.Vector3(a.x, y, laneZ),
        new THREE.Vector3(b.x, y, laneZ),
        new THREE.Vector3(b.x, y, b.z),
        b,
      ];

      const color = CABLE_COLORS[link.mode] ?? this.vlan(link.vlan)?.color ?? '#94a3b8';
      const cable = new Cable(link, points, { color, radius: link.mode === 'trunk' ? 0.04 : 0.028 });
      this.cables.set(link.id, cable);
      this.root.add(cable.mesh);
    });
  }

  #setupPointer() {
    const canvas = this.sm.renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downAt = null;

    const pick = (event) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, this.sm.camera);
      const hit = raycaster.intersectObject(this.root, true).find((i) => i.object.userData.deviceId);
      return hit?.object.userData.deviceId ?? null;
    };

    canvas.addEventListener('pointermove', (event) => {
      const id = pick(event);
      if (id === this.hoveredId) return;
      this.devices.get(this.hoveredId)?.setHovered(false);
      this.devices.get(id)?.setHovered(true);
      this.hoveredId = id;
      canvas.style.cursor = id ? 'pointer' : '';
    });

    // Solo cuenta como clic si el ratón casi no se ha movido (si no, era un arrastre de cámara)
    canvas.addEventListener('pointerdown', (event) => (downAt = { x: event.clientX, y: event.clientY }));
    canvas.addEventListener('pointerup', (event) => {
      if (!downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 5) return;
      this.select(pick(event));
    });
  }

  select(id) {
    if (id === this.selectedId) return;
    this.devices.get(this.selectedId)?.setSelected(false);
    this.devices.get(id)?.setSelected(true);
    this.selectedId = id;
    this.events.emit('select', id);
  }
}

const otherEnd = (link, deviceId) => (link.a.device === deviceId ? link.b.device : link.a.device);
