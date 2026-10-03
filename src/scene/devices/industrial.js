import * as THREE from 'three';
import { mat, glow, box, cylinder, place } from './materials.js';

// Máquina industrial: cuerpo, ventana, cuadro de control y baliza de estado
export function createIndustrial() {
  const g = new THREE.Group();
  const yellow = mat('#c08a12', { roughness: 0.5 });
  const dark = mat('#1f2430');

  place(g, box(1.8, 0.12, 1.2, dark), 0, 0.06, 0);
  place(g, box(1.6, 1.25, 1.05, yellow), -0.1, 0.74, 0);
  place(g, box(1.0, 0.55, 0.02, mat('#0f2a3a', { roughness: 0.1, metalness: 0.6 })), -0.2, 0.85, 0.53);

  // Bandas de seguridad negras
  for (let i = 0; i < 5; i++) {
    const stripe = place(g, box(0.12, 0.08, 0.01, dark), -0.75 + i * 0.3, 0.2, 0.531);
    stripe.rotation.z = 0.6;
  }

  // Cuadro de control con pantalla HMI
  place(g, box(0.36, 0.6, 0.3, dark), 0.9, 1.0, 0.2);
  const hmi = place(g, new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.2), glow('#38bdf8', 1.2)), 0.9, 1.1, 0.352);

  // Baliza de 3 colores (verde encendida = máquina en marcha)
  place(g, cylinder(0.025, 0.3, mat('#6b7280')), 0.55, 1.52, -0.3);
  const beacon = ['#22c55e', '#f59e0b', '#ef4444'].map(
    (c, i) => place(g, cylinder(0.06, 0.1, glow(c, i === 0 ? 2.5 : 0.15)), 0.55, 1.72 + i * 0.105, -0.3).material,
  );

  return {
    group: g,
    height: 2.2,
    ports: { origin: [0.9, 0.12, 0.36] },
    screens: [hmi.material],
    leds: beacon.slice(0, 1),
  };
}
