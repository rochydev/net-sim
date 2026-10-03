import * as THREE from 'three';

// Cable físico entre dos dispositivos. Su curva es la "vía" por la que
// PacketMesh moverá los paquetes en la fase 2.
export class Cable {
  constructor(link, points, { color, radius = 0.028 }) {
    this.link = link;
    this.curve = roundedPath(points, 0.3);
    this.length = this.curve.getLength();

    const geometry = new THREE.TubeGeometry(this.curve, Math.ceil(this.length * 14), radius, 6, false);
    this.material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.12,
      roughness: 0.6,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.raycast = () => {}; // los cables no se seleccionan (de momento)
  }

  // Posición a lo largo del cable (t de 0 a 1) en el sentido de recorrido:
  // si el paquete sale del extremo b, la curva se recorre al revés
  pointAt(t, fromDeviceId, target = new THREE.Vector3()) {
    const u = fromDeviceId === this.link.a.device ? t : 1 - t;
    return this.curve.getPointAt(THREE.MathUtils.clamp(u, 0, 1), target);
  }
}

// Convierte una polilínea en un camino con las esquinas redondeadas
// (tramos rectos + curvas Bézier cuadráticas en cada giro)
function roundedPath(rawPoints, radius) {
  const pts = rawPoints.filter((p, i) => i === 0 || p.distanceToSquared(rawPoints[i - 1]) > 1e-6);
  const path = new THREE.CurvePath();
  let current = pts[0].clone();

  for (let i = 1; i < pts.length - 1; i++) {
    const [prev, corner, next] = [pts[i - 1], pts[i], pts[i + 1]];
    const r = Math.min(radius, corner.distanceTo(prev) / 2, corner.distanceTo(next) / 2);
    const before = corner.clone().addScaledVector(prev.clone().sub(corner).normalize(), r);
    const after = corner.clone().addScaledVector(next.clone().sub(corner).normalize(), r);

    if (current.distanceToSquared(before) > 1e-8) path.add(new THREE.LineCurve3(current, before));
    path.add(new THREE.QuadraticBezierCurve3(before, corner.clone(), after));
    current = after;
  }
  path.add(new THREE.LineCurve3(current, pts.at(-1).clone()));
  return path;
}
