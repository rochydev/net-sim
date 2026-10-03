import { describe, it, expect, beforeEach } from 'vitest';
import { topology } from '../src/config/topology.js';
import { Simulator } from '../src/sim/Simulator.js';
import { Shell } from '../src/sim/shell/Shell.js';
import { ScenarioRunner } from '../src/scenarios/ScenarioRunner.js';
import { scenarios } from '../src/scenarios/index.js';

// Ejecuta los escenarios completos sin escena ni DOM: el mismo contexto que usa
// main.js, pero los comandos van directos al Shell y se guarda su salida.
describe('escenarios', () => {
  let sim;
  let output;
  let runner;

  beforeEach(() => {
    sim = new Simulator(topology, { random: () => 0.5 });
    const shell = new Shell(sim);
    output = [];
    runner = new ScenarioRunner({
      prepare: async () => sim.reset(),
      command: async (deviceId, line) => {
        for await (const text of shell.run(deviceId, line)) output.push(text);
      },
      focus: () => {},
      setDeviceUp: (id, up) => sim.setDeviceUp(id, up),
      wait: (ms) => sim.wait(ms),
    });
  });

  const run = (id) => runner.run(scenarios.find((s) => s.id === id));

  it('todos tienen id único, título, descripción y pasos con texto', () => {
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
    for (const scenario of scenarios) {
      expect(scenario.title && scenario.description).toBeTruthy();
      expect(scenario.steps.every((step) => step.caption && typeof step.run === 'function')).toBe(true);
    }
  });

  it('ping: responde con TTL 127 y aprende la MAC de la puerta de enlace', async () => {
    await run('ping');
    expect(output).toContain('Respuesta desde 192.168.50.10: bytes=32 tiempo<1m TTL=127');
    expect(output.join('\n')).toMatch(/192\.168\.10\.1\s+00-09-0f-a1-00-10\s+dinámico/);
  });

  it('dhcp: el PC termina con su IP y sus datos de red', async () => {
    await run('dhcp');
    const text = output.join('\n');
    expect(text).toMatch(/Dirección IPv4[ .]+: 192\.168\.10\.102\(Preferido\)/);
    expect(text).toMatch(/Servidor DHCP[ .]+: 192\.168\.50\.10/);
  });

  it('fallo de DHCP: APIPA, error general al hacer ping y recuperación final', async () => {
    await run('dhcp-failure');
    const text = output.join('\n');
    expect(text).toMatch(/configuración automática: 169\.254\./);
    expect(text).toContain('PING: error en la transmisión. Error general.');
    expect(sim.engine.device('pc3').ifaces[0].ip).toBe('192.168.10.103');
    expect(sim.engine.device('srv').up).toBe(true);
  });

  it('no deja lanzar un escenario mientras otro está en curso', async () => {
    const steps = [];
    runner.events.on('step', ({ scenario }) => steps.push(scenario.id));
    await Promise.all([run('ping'), run('dhcp')]);
    expect(new Set(steps)).toEqual(new Set(['ping']));
  });
});
