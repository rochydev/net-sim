import * as THREE from 'three';
import { PALETTE, mat, glow, box, place } from './materials.js';

// Portátil sobre una mesa alta (zona de invitados)
export function createLaptop({ accent }) {
  const g = new THREE.Group();
  const deskH = 0.74;
  const aluminium = mat('#9aa3b2', { metalness: 0.5 });

  place(g, box(1.1, 0.05, 0.7, mat(PALETTE.deskTop)), 0, deskH, 0);
  place(g, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.2, deskH, 8), mat(PALETTE.metal)), 0, deskH / 2, 0);

  place(g, box(0.5, 0.025, 0.34, aluminium), 0, deskH + 0.04, 0.05);

  // La tapa va en un grupo con el pivote en la bisagra para poder inclinarla
  const lid = new THREE.Group();
  lid.position.set(0, deskH + 0.05, -0.12);
  lid.rotation.x = -0.32;
  place(lid, box(0.5, 0.32, 0.02, aluminium), 0, 0.16, 0);
  const screen = place(lid, new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.27), glow(accent, 1.5)), 0, 0.16, 0.011);
  g.add(lid);

  return {
    group: g,
    height: 1.25,
    ports: { origin: [0, 0.1, -0.1] },
    screens: [screen.material],
    leds: [],
  };
}
