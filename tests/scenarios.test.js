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
      select: () => {},
      setPolicyEnabled: (id, policy, enabled) => sim.setPolicyEnabled(id, policy, enabled),
      setDeviceUp: (id, up) => sim.setDeviceUp(id, up),
      setLinkUp: (id, up) => sim.setLinkUp(id, up),
      setServiceRunning: (id, service, running) => sim.setServiceRunning(id, service, running),
      note: () => {},
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

  it('dns: interno con autoridad, externo vía reenviador y después desde caché', async () => {
    const queries = [];
    sim.events.on('trace', ({ packet, from }) => {
      if (packet.kind === 'query') queries.push(from);
    });
    await run('dns');
    expect(output).toContain('Haciendo ping a intranet.nave.local [192.168.50.10] con 32 bytes de datos:');
    expect(output.filter((l) => l.startsWith('Respuesta desde 93.184.215.14'))).toHaveLength(2);
    expect(queries).toEqual(['pc1', 'pc1', 'srv']);
  });

  it('fallo de DNS: el nombre falla, la IP responde y al final se recupera', async () => {
    await run('dns-failure');
    expect(output).toContain(
      'La solicitud de ping no pudo encontrar el host www.example.com. Compruebe el nombre y vuelva a intentarlo.',
    );
    expect(output).toContain('*** Se agotó el tiempo de espera de la solicitud a UnKnown.');
    expect(output.filter((l) => l.startsWith('Respuesta desde 93.184.215.14'))).toHaveLength(2);
  });

  it('firewall: bloqueado por el deny implícito, permitido con la política #5 y vuelta a cerrar', async () => {
    await run('firewall');
    const timeouts = output.filter((l) => l === 'Tiempo de espera agotado para esta solicitud.');
    const replies = output.filter((l) => l.startsWith('Respuesta desde 192.168.20.11'));
    expect(timeouts).toHaveLength(2);
    expect(replies).toHaveLength(2);

    const fw = sim.engine.device('fw');
    expect(fw.policies.find((p) => p.id === 5)).toMatchObject({ enabled: false, hits: 2 });
    expect(fw.implicitDenyHits).toBe(2);
  });

  it('averías: medios desconectados, error general, switch caído y recuperación', async () => {
    await run('breakage');
    const text = output.join('\n');
    expect(text).toMatch(/Estado de los medios[ .]+: medios desconectados/);
    expect(output).toContain('PING: error en la transmisión. Error general.');
    expect(output.filter((l) => l === 'Respuesta desde 192.168.10.102: Host de destino inaccesible.')).toHaveLength(2);
    expect(output.filter((l) => l.startsWith('Respuesta desde 192.168.10.1:'))).toHaveLength(2);
  });

  describe('modo guiado', () => {
    beforeEach(() => (runner.guided = true));

    it('espera a next() antes de cada paso salvo el primero', async () => {
      const shown = [];
      runner.events.on('step', ({ index }) => shown.push(index));
      runner.events.on('waiting', () => setTimeout(() => runner.next(), 0));
      await run('ping');
      expect(shown).toEqual([0, 1, 2]);
    });

    it('stop() termina el escenario sin ejecutar los pasos pendientes', async () => {
      const shown = [];
      let ended;
      runner.events.on('step', ({ index }) => shown.push(index));
      runner.events.on('waiting', () => runner.stop());
      runner.events.on('end', (info) => (ended = info));
      await run('dhcp');
      expect(shown).toEqual([0]);
      expect(ended.stopped).toBe(true);
    });
  });

  it('no deja lanzar un escenario mientras otro está en curso', async () => {
    const steps = [];
    runner.events.on('step', ({ scenario }) => steps.push(scenario.id));
    await Promise.all([run('ping'), run('dhcp')]);
    expect(new Set(steps)).toEqual(new Set(['ping']));
  });
});
