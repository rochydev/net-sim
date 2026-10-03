import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const CORE = new THREE.SphereGeometry(0.11, 20, 14);
const TRAIL_LENGTH = 5;
const TRAIL_SPACING = 0.12; // metros entre esferas de la estela

// Paquete visible: esfera brillante + estela + etiqueta con el tipo de trama.
export class PacketMesh {
  constructor(color, label) {
    this.group = new THREE.Group();

    // Color algo por encima de 1 y sin tone mapping: supera el umbral del bloom y deja un halo leve
    this.material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(1.5),
      toneMapped: false,
      transparent: true,
    });
    this.core = new THREE.Mesh(CORE, this.material);
    this.group.add(this.core);

    this.trail = Array.from({ length: TRAIL_LENGTH }, (_, i) => {
      const dot = new THREE.Mesh(CORE, this.material);
      dot.scale.setScalar(0.6 * (1 - i / TRAIL_LENGTH));
      this.group.add(dot);
      return dot;
    });

    if (label) {
      const el = document.createElement('div');
      el.innerHTML = `<span class="packet-tag" style="--accent:${color}">${label}</span>`;
      this.label = new CSS2DObject(el);
      this.label.position.y = 0.45;
      this.core.add(this.label);
    }
  }

  // Coloca el paquete en la fracción t del cable. La estela son puntos un poco
  // más atrás en la misma curva, así sigue las curvas del cable sin guardar historial.
  place(cable, fromDeviceId, t) {
    cable.pointAt(t, fromDeviceId, this.core.position);
    this.trail.forEach((dot, i) => {
      const back = t - ((i + 1) * TRAIL_SPACING) / cable.length;
      dot.visible = back > 0;
      if (dot.visible) cable.pointAt(back, fromDeviceId, dot.position);
    });
  }

  setOpacity(value) {
    this.material.opacity = value;
    if (this.label) this.label.element.style.opacity = value;
  }

  dispose() {
    // CSS2DObject solo retira su elemento del DOM cuando es él quien sale de la escena,
    // no cuando se quita un antecesor; por eso la etiqueta se quita explícitamente
    if (this.label) this.core.remove(this.label);
    this.group.removeFromParent();
    this.material.dispose();
  }
}
