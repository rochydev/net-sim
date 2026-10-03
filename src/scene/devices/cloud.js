import * as THREE from 'three';

// Nube low-poly hecha con icosaedros solapados
export function createCloud() {
  const g = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: '#b8c7ff',
    emissive: '#3b5bdb',
    emissiveIntensity: 0.35,
    roughness: 0.8,
    flatShading: true,
  });

  const puffs = [
    [0, 0, 0, 1.3],
    [-1.3, -0.25, 0.1, 0.95],
    [1.3, -0.2, 0, 1.0],
    [-0.6, 0.55, -0.1, 0.9],
    [0.7, 0.5, 0.1, 0.85],
    [2.2, -0.45, 0, 0.6],
    [-2.1, -0.5, 0, 0.55],
  ];
  for (const [x, y, z, r] of puffs) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), material);
    mesh.position.set(x, y, z);
    g.add(mesh);
  }

  return {
    group: g,
    height: 2.2,
    ports: { origin: [0, -0.9, 0.5] },
    screens: [],
    leds: [],
  };
}
