import * as THREE from 'three';
import { PALETTE, mat, glow, box, place } from './materials.js';
import { addRackStand } from './rackStand.js';

// Switch de 24 puertos sobre soporte. Los puertos (LEDs) están en el frontal
export function createSwitch() {
  const g = new THREE.Group();
  const y = 0.95;
  const width = 1.5;

  addRackStand(g, { width: width - 0.1, depth: 0.5, height: y - 0.06 });
  place(g, box(width, 0.12, 0.55, mat(PALETTE.bodyLight, { metalness: 0.4 })), 0, y, 0);

  const leds = [];
  for (let i = 0; i < 24; i++) {
    const row = i % 2;
    const col = Math.floor(i / 2);
    const led = place(g, box(0.07, 0.035, 0.01, glow('#4ade80', 2.4)), -0.6 + col * 0.09, y + 0.025 - row * 0.05, 0.28);
    leds.push(led.material);
  }

  return {
    group: g,
    height: y + 0.35,
    // Los cables salen repartidos a lo largo del frontal
    ports: { origin: [0, y - 0.04, 0.3], axis: 'x', width: 1.1 },
    screens: [],
    leds,
  };
}
