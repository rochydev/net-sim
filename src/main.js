import './styles/main.css';
import { topology } from './config/topology.js';
import { layout } from './config/layout.js';
import { Simulator } from './sim/Simulator.js';
import { SceneManager } from './scene/SceneManager.js';
import { NetworkView } from './scene/NetworkView.js';
import { Effects } from './scene/Effects.js';
import { PacketAnimator } from './scene/PacketAnimator.js';
import { ScenarioRunner } from './scenarios/ScenarioRunner.js';
import { scenarios } from './scenarios/index.js';
import { DevicePanel } from './ui/DevicePanel.js';
import { Terminal } from './ui/Terminal.js';
import { PacketCapture } from './ui/PacketCapture.js';
import { ScenarioMenu } from './ui/ScenarioMenu.js';
import { Caption } from './ui/Caption.js';
import { Dock } from './ui/Dock.js';
import { Legend } from './ui/Legend.js';
import { icon } from './ui/icons.js';

// Punto de entrada: crea las piezas y las conecta. No contiene lógica propia.

// Simulación (sin dependencias de la vista)
const sim = new Simulator(topology);

// Escena 3D: representa la topología y reproduce lo que calcula el simulador
const sceneManager = new SceneManager(document.getElementById('viewport'));
const view = new NetworkView(sceneManager, topology, layout);
const effects = new Effects(view);
const animator = new PacketAnimator(sceneManager, view, effects);
sim.setPlayer(animator);

// Interfaz
const terminal = new Terminal(document.createElement('div'), sim);
const capture = new PacketCapture(document.createElement('div'), sim);
const panel = new DevicePanel(document.getElementById('device-panel'), sim.engine, {
  onClose: () => view.select(null),
  onTogglePolicy: (deviceId, policyId, enabled) => {
    sim.setPolicyEnabled(deviceId, policyId, enabled);
    effects.note(
      deviceId,
      `Política #${policyId} ${enabled ? 'activada' : 'desactivada'}`,
      enabled ? 'success' : 'warning',
    );
  },
  onOpenTerminal: (deviceId) => {
    terminal.setDevice(deviceId);
    dock.select('terminal');
    terminal.focus();
  },
});

// Escenarios: la única vía por la que actúan es este contexto
const runner = new ScenarioRunner({
  prepare: async () => {
    sim.reset();
    capture.clear();
  },
  command: async (deviceId, line) => {
    terminal.setDevice(deviceId);
    dock.select('terminal');
    await terminal.run(line);
  },
  focus: (deviceId) => sceneManager.focusOn(view.getDevice(deviceId).focusPoint),
  select: (deviceId) => view.select(deviceId),
  setPolicyEnabled: (deviceId, policyId, enabled) => sim.setPolicyEnabled(deviceId, policyId, enabled),
  setDeviceUp: (deviceId, up) => sim.setDeviceUp(deviceId, up),
  setServiceRunning: (deviceId, service, running) => sim.setServiceRunning(deviceId, service, running),
  note: (deviceId, text, tone) => effects.note(deviceId, text, tone),
  wait: (ms) => sim.wait(ms),
});
runner.events.on('start', () => terminal.setLocked(true));
runner.events.on('end', () => terminal.setLocked(false));

const scenarioMenu = new ScenarioMenu(document.createElement('div'), runner, scenarios, {
  onReset: () => sim.reset(),
});
new Caption(document.getElementById('caption'), runner);

const dock = new Dock(document.getElementById('dock'), [
  { id: 'scenarios', label: 'Escenarios', icon: 'scenarios', content: scenarioMenu.el },
  { id: 'terminal', label: 'Terminal', icon: 'terminal', content: terminal.el },
  { id: 'capture', label: 'Captura', icon: 'activity', content: capture.el },
]);
capture.onChange = (count) => dock.setBadge('capture', count || '');

new Legend(document.getElementById('legend'), { onSpeedChange: (speed) => (animator.speed = speed) });
document.getElementById('brand-mark').innerHTML = icon('network', 17);

// La vista y el panel reflejan los cambios de estado del simulador
const syncDevice = (id) => {
  view.getDevice(id).sync(sim.engine.device(id));
  panel.refresh(id);
};
sim.events.on('device', ({ id }) => syncDevice(id));
sim.events.on('reset', () => view.devices.forEach((_, id) => syncDevice(id)));

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
