import * as THREE from 'three';
import { PALETTE, mat, glow, box, place } from './materials.js';

// Puesto de oficina: mesa, monitor, teclado y torre bajo la mesa
export function createPC({ accent }) {
  const g = new THREE.Group();
  const deskH = 0.76;

  place(g, box(1.6, 0.06, 0.8, mat(PALETTE.deskTop)), 0, deskH, 0);
  for (const [x, z] of [
    [-0.74, -0.34],
    [0.74, -0.34],
    [-0.74, 0.34],
    [0.74, 0.34],
  ]) {
    place(g, box(0.05, deskH, 0.05, mat(PALETTE.desk)), x, deskH / 2, z);
  }

  // Monitor
  place(g, box(0.28, 0.02, 0.18, mat(PALETTE.body)), 0, deskH + 0.04, -0.2);
  place(g, box(0.06, 0.24, 0.05, mat(PALETTE.body)), 0, deskH + 0.15, -0.22);
  place(g, box(0.92, 0.52, 0.04, mat(PALETTE.body)), 0, deskH + 0.5, -0.2);
  const screen = place(
    g,
    new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.46), glow(accent, 0.55)),
    0,
    deskH + 0.5,
    -0.179,
  );

  // Teclado y ratón
  place(g, box(0.5, 0.02, 0.15, mat(PALETTE.bodyLight)), -0.05, deskH + 0.04, 0.12);
  place(g, box(0.06, 0.02, 0.1, mat(PALETTE.bodyLight)), 0.32, deskH + 0.04, 0.12);

  // Torre con LED de encendido
  place(g, box(0.22, 0.46, 0.46, mat(PALETTE.body)), 0.55, 0.23, -0.05);
  const led = place(g, box(0.03, 0.03, 0.01, glow('#7fb8d6', 1.2)), 0.55, 0.4, 0.185);

  return {
    group: g,
    height: 1.5,
    ports: { origin: [0.55, 0.12, -0.3] },
    screens: [screen.material],
    leds: [led.material],
  };
}
