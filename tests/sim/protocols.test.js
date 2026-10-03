import { describe, it, expect, beforeEach } from 'vitest';
import { topology } from '../../src/config/topology.js';
import { Simulator } from '../../src/sim/Simulator.js';
import { echo, traceroute } from '../../src/sim/protocols/icmp.js';

const collect = async (generator) => {
  const items = [];
  for await (const item of generator) items.push(item);
  return items;
};

describe('protocolos', () => {
  let sim;
  let sent;
  beforeEach(() => {
    sim = new Simulator(topology, { random: () => 0.5 });
    sent = [];
    sim.events.on('trace', ({ packet }) => sent.push(`${packet.protocol}:${packet.kind}`));
  });

  it('hace ARP solo la primera vez y después usa la caché', async () => {
    await echo(sim, 'pc1', '192.168.10.102');
    expect(sent).toEqual(['arp:request', 'arp:reply', 'icmp:echo-request', 'icmp:echo-reply']);
    expect(sim.engine.device('pc1').arp.get('192.168.10.102')).toBe('D4:81:D7:1A:22:02');
    // El destino aprende la MAC de quien le preguntó
    expect(sim.engine.device('pc2').arp.has('192.168.10.101')).toBe(true);

    sent.length = 0;
    await echo(sim, 'pc1', '192.168.10.102', { seq: 2 });
    expect(sent).toEqual(['icmp:echo-request', 'icmp:echo-reply']);
  });

  it('para salir de la subred pregunta por la MAC de la puerta de enlace, no del destino', async () => {
    const result = await echo(sim, 'pc1', '192.168.50.10');
    expect(result).toMatchObject({ status: 'reply', ttl: 127 });
    expect([...sim.engine.device('pc1').arp.keys()]).toEqual(['192.168.10.1']);
  });

  it('devuelve "inaccesible" desde la propia IP si nadie contesta al ARP', async () => {
    const result = await echo(sim, 'pc1', '192.168.10.250');
    expect(result).toEqual({ status: 'unreachable', from: '192.168.10.101' });
  });

  it('agota el tiempo cuando el firewall descarta en silencio', async () => {
    expect(await echo(sim, 'lap1', '192.168.20.11')).toEqual({ status: 'timeout' });
  });

  it('el ping a Internet vuelve con el TTL del host remoto descontando los saltos', async () => {
    const result = await echo(sim, 'pc1', '8.8.8.8');
    expect(result.status).toBe('reply');
    expect(result.ttl).toBe(124);
    expect(result.time).toBeGreaterThan(10);
  });

  it('tracert descubre el firewall y los routers del ISP', async () => {
    const hops = await collect(traceroute(sim, 'pc1', '8.8.8.8'));
    expect(hops.map((h) => h.from)).toEqual([
      '192.168.10.1',
      '203.0.113.1',
      '198.51.100.17',
      '198.51.100.94',
      '8.8.8.8',
    ]);
    expect(hops.at(-1).status).toBe('reply');
  });

  it('tracert se rinde tras 3 saltos sin respuesta', async () => {
    const hops = await collect(traceroute(sim, 'lap1', '192.168.20.11'));
    expect(hops.map((h) => h.status)).toEqual(['ttl-exceeded', 'timeout', 'timeout', 'timeout']);
  });
});
