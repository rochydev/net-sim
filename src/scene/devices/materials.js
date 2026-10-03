import * as THREE from 'three';

// Paleta común de los modelos low-poly
export const PALETTE = {
  body: '#1d2433',
  bodyLight: '#2c3649',
  metal: '#5b6577',
  desk: '#3b3530',
  deskTop: '#6b5a48',
};

const cache = new Map();

// Material mate con sombreado plano (flatShading = aspecto low-poly facetado).
// Se cachean: muchos meshes comparten el mismo material y la GPU lo agradece.
export function mat(color, { roughness = 0.65, metalness = 0.15 } = {}) {
  const key = `${color}|${roughness}|${metalness}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true }));
  }
  return cache.get(key);
}

// Material emisivo (pantallas, LEDs). No se cachea porque cada equipo
// lo modificará por separado (p. ej. apagarlo cuando el equipo cae).
export function glow(color, intensity = 1.6) {
  return new THREE.MeshStandardMaterial({
    color: '#000000',
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
  });
}

export function box(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function cylinder(radius, height, material, segments = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  mesh.castShadow = true;
  return mesh;
}

// Coloca un mesh y lo añade al grupo en una sola línea
export function place(group, mesh, x, y, z) {
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}
