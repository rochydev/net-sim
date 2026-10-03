import { PALETTE, mat, box, place } from './materials.js';

// Soporte abierto de 4 postes para equipos de red (switch, firewall)
export function addRackStand(group, { width, depth, height }) {
  const post = mat(PALETTE.metal, { metalness: 0.6, roughness: 0.4 });
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    place(group, box(0.05, height, 0.05, post), (x * width) / 2, height / 2, (z * depth) / 2);
  }
  place(group, box(width + 0.05, 0.03, depth + 0.05, post), 0, 0.08, 0);
}
