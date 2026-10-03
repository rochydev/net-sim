import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Zona del suelo coloreada según su VLAN (Oficinas, Producción...)
export function createZone(zone, vlan) {
  const [x0, x1] = zone.x;
  const [z0, z1] = zone.z;
  const width = x1 - x0;
  const depth = z1 - z0;
  const group = new THREE.Group();
  group.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);

  const plane = new THREE.PlaneGeometry(width, depth);
  plane.rotateX(-Math.PI / 2);

  const fill = new THREE.Mesh(
    plane,
    new THREE.MeshBasicMaterial({ color: vlan.color, transparent: true, opacity: 0.07, depthWrite: false }),
  );
  fill.position.y = 0.006;
  fill.raycast = () => {};
  group.add(fill);

  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(plane),
    new THREE.LineBasicMaterial({ color: vlan.color, transparent: true, opacity: 0.55 }),
  );
  border.position.y = 0.01;
  group.add(border);

  const el = document.createElement('div');
  el.className = 'zone-label';
  el.style.setProperty('--accent', vlan.color);
  // CSS2DObject centra el elemento en su punto (vía style.transform); el span
  // interior lo desplaza para alinear el texto a la izquierda desde la esquina
  el.innerHTML = `<span><b>VLAN ${vlan.id}</b> ${zone.label}<small>${vlan.subnet}</small></span>`;
  const label = new CSS2DObject(el);
  label.position.set(-width / 2 + 0.1, 0.02, -depth / 2 - 0.45);
  group.add(label);

  return group;
}
