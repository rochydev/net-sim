import * as THREE from 'three';
import { PALETTE, mat, glow, box, place } from './materials.js';
import { addRackStand } from './rackStand.js';

// Firewall tipo appliance: cuerpo oscuro con frontal rojo
export function createFirewall() {
  const g = new THREE.Group();
  const y = 0.95;

  addRackStand(g, { width: 1.0, depth: 0.5, height: y - 0.08 });
  place(g, box(1.1, 0.16, 0.55, mat(PALETTE.body, { metalness: 0.4 })), 0, y, 0);
  place(g, box(1.1, 0.16, 0.02, mat('#9e3b42')), 0, y, 0.285);

  // Escudo estilizado en el frontal
  const shield = place(g, new THREE.Mesh(new THREE.CircleGeometry(0.05, 6), glow('#f0b4b9', 1.1)), -0.42, y, 0.297);

  const leds = [];
  for (let i = 0; i < 6; i++) {
    leds.push(place(g, box(0.05, 0.03, 0.01, glow('#8cc98f', 1.1)), -0.1 + i * 0.09, y, 0.297).material);
  }

  return {
    group: g,
    height: y + 0.4,
    ports: { origin: [0.15, y - 0.05, 0.3], axis: 'x', width: 0.5 },
    screens: [shield.material],
    leds,
  };
}
