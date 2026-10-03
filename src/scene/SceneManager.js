import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const BACKGROUND = 0x070b14;
const HOME_POSITION = new THREE.Vector3(0, 12.5, 17.5);
const HOME_TARGET = new THREE.Vector3(0, 0, -2.8);

// Infraestructura 3D genérica: escena, cámara, luces, render loop y post-procesado.
// No sabe nada de redes; los demás módulos se enganchan con onUpdate().
export class SceneManager {
  constructor(container) {
    this.container = container;
    this.updaters = new Set();
    this.clock = new THREE.Clock();

    this.#createScene();
    this.#createRenderers();
    this.#createCamera();
    this.#createLights();
    this.#createFloor();
    this.#createPostProcessing();

    new ResizeObserver(() => this.#resize()).observe(container);
    this.#resize();
  }

  get size() {
    return { width: this.container.clientWidth, height: this.container.clientHeight };
  }

  #createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BACKGROUND);
    // La niebla del mismo color que el fondo difumina el borde del suelo
    this.scene.fog = new THREE.Fog(BACKGROUND, 32, 75);
  }

  #createRenderers() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.container.appendChild(this.renderer.domElement);

    // Segundo renderer que pinta elementos HTML (etiquetas) en posiciones 3D
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    this.container.appendChild(this.labelRenderer.domElement);
  }

  #createCamera() {
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(0, 34, 46); // arranca lejos para la animación de entrada

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(HOME_TARGET);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 55;
    this.controls.maxPolarAngle = Math.PI * 0.46; // no dejar que la cámara baje del suelo
    this.controls.enabled = false;
    // Si el usuario toca la cámara, se cancela cualquier movimiento automático
    this.controls.addEventListener('start', () => {
      this.focus = null;
      this.reset = null;
    });

    this.intro = { t: 0, duration: 2.6, from: this.camera.position.clone() };
  }

  #createLights() {
    this.scene.add(new THREE.HemisphereLight(0x8fb3ff, 0x0b0f1a, 0.9));

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(12, 22, 14);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005;
    Object.assign(key.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 });
    this.scene.add(key);

    // Luz de contra azulada para separar los equipos del fondo
    const rim = new THREE.DirectionalLight(0x4f7cff, 0.8);
    rim.position.set(-14, 10, -18);
    this.scene.add(rim);
  }

  #createFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: 0x0c1220, roughness: 0.95, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(120, 120, 0x1b2740, 0x121a2c);
    grid.position.y = 0.002;
    this.scene.add(grid);
  }

  #createPostProcessing() {
    // Render target con MSAA: sin esto el composer pierde el antialias del renderer
    const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // Bloom: solo brillan los colores por encima del umbral (pantallas, LEDs, paquetes)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  #resize() {
    const { width, height } = this.size;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width, height);
    this.labelRenderer.setSize(width, height);
  }

  // Registra una función que se llama cada frame con el delta en segundos
  onUpdate(fn) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  // Desplaza cámara y objetivo juntos hacia un punto (paneo suave, sin girar la vista)
  focusOn(point) {
    this.focus = point.clone();
  }

  resetView() {
    this.focus = null;
    this.reset = { t: 0, fromPos: this.camera.position.clone(), fromTarget: this.controls.target.clone() };
  }

  #updateCamera(dt) {
    if (this.intro) {
      this.intro.t += dt;
      const k = easeOutCubic(Math.min(this.intro.t / this.intro.duration, 1));
      this.camera.position.lerpVectors(this.intro.from, HOME_POSITION, k);
      if (k === 1) {
        this.intro = null;
        this.controls.enabled = true;
      }
    } else if (this.reset) {
      this.reset.t += dt;
      const k = easeOutCubic(Math.min(this.reset.t / 1.2, 1));
      this.camera.position.lerpVectors(this.reset.fromPos, HOME_POSITION, k);
      this.controls.target.lerpVectors(this.reset.fromTarget, HOME_TARGET, k);
      if (k === 1) this.reset = null;
    } else if (this.focus) {
      // Interpolación exponencial: independiente de los FPS
      const delta = this.focus
        .clone()
        .sub(this.controls.target)
        .multiplyScalar(1 - Math.exp(-dt * 4));
      this.controls.target.add(delta);
      this.camera.position.add(delta);
      if (delta.lengthSq() < 1e-6) this.focus = null;
    }
    this.controls.update();
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.#updateCamera(dt);
      this.updaters.forEach((fn) => fn(dt, this.clock.elapsedTime));
      this.composer.render();
      this.labelRenderer.render(this.scene, this.camera);
    });
  }
}

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
