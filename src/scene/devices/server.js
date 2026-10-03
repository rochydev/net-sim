import * as THREE from 'three';
import { PALETTE, mat, glow, box, place } from './materials.js';

// Armario rack con varios servidores dentro
export function createServer({ accent }) {
  const g = new THREE.Group();
  const h = 2.0;

  place(g, box(0.75, h, 0.9, mat(PALETTE.body, { metalness: 0.35 })), 0, h / 2, 0);
  place(g, box(0.79, 0.04, 0.94, mat(PALETTE.bodyLight)), 0, h, 0);

  const leds = [];
  for (let i = 0; i < 6; i++) {
    const y = 0.35 + i * 0.27;
    place(g, box(0.62, 0.2, 0.02, mat(PALETTE.bodyLight, { metalness: 0.5 })), 0, y, 0.456);
    // Tira de LEDs de actividad en cada unidad
    leds.push(place(g, box(0.36, 0.025, 0.01, glow(accent, 0.9)), -0.08, y, 0.468).material);
    leds.push(place(g, box(0.04, 0.04, 0.01, glow('#8cc98f', 1.2)), 0.24, y, 0.468).material);
  }

  return {
    group: g,
    height: h + 0.4,
    ports: { origin: [0.2, 0.08, 0.47] },
    screens: [],
    leds,
  };
}
