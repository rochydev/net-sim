import { describe, it, expect, beforeEach } from 'vitest';
import { topology } from '../../src/config/topology.js';
import { Simulator } from '../../src/sim/Simulator.js';
import { Shell } from '../../src/sim/shell/Shell.js';
import { echo } from '../../src/sim/protocols/icmp.js';

describe('averías', () => {
  let sim;
  let shell;
  const run = async (deviceId, line) => {
    const lines = [];
    for await (const l of shell.run(deviceId, line)) lines.push(l);
    return lines;
  };

  beforeEach(() => {
    sim = new Simulator(topology, { random: () => 0.5 });
    shell = new Shell(sim);
  });

  describe('cable desconectado', () => {
    beforeEach(() => sim.setLinkUp('l-pc1', false));

    it('ipconfig muestra "medios desconectados" y ping falla sin enviar nada', async () => {
      const sent = [];
      sim.events.on('trace', ({ packet }) => sent.push(packet));
      expect((await run('pc1', 'ipconfig')).join('\n')).toMatch(/Estado de los medios[ .]+: medios desconectados/);
      expect(await echo(sim, 'pc1', '192.168.10.1')).toEqual({ status: 'no-route' });
      expect(sent).toEqual([]);
    });

    it('ipconfig /renew no puede operar sin medio', async () => {
      expect(await run('pc1', 'ipconfig /renew')).toContain(
        'No se puede realizar ninguna operación en Ethernet mientras los medios estén desconectados.',
      );
    });

    it('el resto de la VLAN sigue funcionando y el switch no inunda por el puerto caído', async () => {
      expect((await echo(sim, 'pc2', '192.168.10.103')).status).toBe('reply');
      const arpTrace = [];
      sim.events.on('trace', ({ packet, trace }) => packet.protocol === 'arp' && arpTrace.push(trace));
      await echo(sim, 'pc2', '192.168.10.1');
      expect(arpTrace[0].nodes.map((n) => n.device)).not.toContain('pc1');
    });

    it('al reconectarlo vuelve a funcionar', async () => {
      sim.setLinkUp('l-pc1', true);
      expect((await echo(sim, 'pc1', '192.168.10.1')).status).toBe('reply');
    });
  });

  it('con el trunk caído no hay tráfico entre VLANs, pero sí dentro de cada una', async () => {
    sim.setLinkUp('trunk', false);
    expect((await echo(sim, 'pc1', '192.168.50.10')).status).toBe('unreachable');
    expect((await echo(sim, 'pc1', '192.168.10.102')).status).toBe('reply');
  });

  it('con el switch caído nadie contesta al ARP: "host de destino inaccesible"', async () => {
    sim.setDeviceUp('sw', false);
    expect(await echo(sim, 'pc2', '192.168.10.1')).toEqual({ status: 'unreachable', from: '192.168.10.102' });
  });

  it('un equipo apagado no ejecuta comandos', async () => {
    sim.setDeviceUp('pc3', false);
    expect(await run('pc3', 'ipconfig')).toEqual(['(El equipo está apagado: no responde)']);
  });

  it('reset reconecta todos los cables', () => {
    sim.setLinkUp('trunk', false);
    sim.reset();
    expect(sim.engine.isLinkUp('trunk')).toBe(true);
  });
});
