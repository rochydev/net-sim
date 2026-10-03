import './styles/main.css';
import { topology } from './config/topology.js';
import { layout } from './config/layout.js';
import { Simulator } from './sim/Simulator.js';
import { SceneManager } from './scene/SceneManager.js';
import { NetworkView } from './scene/NetworkView.js';
import { Effects } from './scene/Effects.js';
import { PacketAnimator } from './scene/PacketAnimator.js';
import { DevicePanel } from './ui/DevicePanel.js';
import { Terminal } from './ui/Terminal.js';
import { PacketCapture } from './ui/PacketCapture.js';
import { Dock } from './ui/Dock.js';
import { Legend } from './ui/Legend.js';

// Punto de entrada: crea las piezas y las conecta. No contiene lógica propia.

// Simulación (sin dependencias de la vista)
const sim = new Simulator(topology);

// Escena 3D: representa la topología y reproduce lo que calcula el simulador
const sceneManager = new SceneManager(document.getElementById('viewport'));
const view = new NetworkView(sceneManager, topology, layout);
const animator = new PacketAnimator(sceneManager, view, new Effects(view));
sim.setPlayer(animator);

// Interfaz
const terminal = new Terminal(document.createElement('div'), sim);
const capture = new PacketCapture(document.createElement('div'), sim);
const dock = new Dock(document.getElementById('dock'), [
  { id: 'terminal', label: 'Terminal', content: terminal.el },
  { id: 'capture', label: 'Captura', content: capture.el },
]);
capture.onChange = (count) => dock.setBadge('capture', count || '');

new Legend(document.getElementById('legend'), { onSpeedChange: (speed) => (animator.speed = speed) });

const panel = new DevicePanel(document.getElementById('device-panel'), sim.engine, {
  onClose: () => view.select(null),
  onOpenTerminal: (deviceId) => {
    terminal.setDevice(deviceId);
    dock.select('terminal');
    terminal.focus();
  },
});

view.events.on('select', (id) => {
  if (!id) return panel.hide();
  panel.show(id);
  sceneManager.focusOn(view.getDevice(id).focusPoint);
});

window.addEventListener('keydown', (event) => {
  // Los atajos no deben dispararse mientras se escribe en la terminal
  if (event.target.closest('input, select, textarea')) return;
  if (event.key === 'Escape') view.select(null);
  if (event.key.toLowerCase() === 'r') sceneManager.resetView();
});

sceneManager.start();
