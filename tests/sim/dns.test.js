import { describe, it, expect, beforeEach } from 'vitest';
import { topology } from '../../src/config/topology.js';
import { Simulator } from '../../src/sim/Simulator.js';
import { resolveName, lookup, qualify } from '../../src/sim/protocols/dns.js';
import { echo } from '../../src/sim/protocols/icmp.js';

describe('DNS', () => {
  let sim;
  let dns;
  beforeEach(() => {
    sim = new Simulator(topology, { random: () => 0.5 });
    dns = [];
    sim.events.on('trace', ({ packet, from }) => {
      if (packet.protocol === 'dns') dns.push(`${from}:${packet.kind}`);
    });
  });

  it('completa los nombres cortos con el sufijo del dominio solo en equipos unidos a él', () => {
    expect(qualify(sim, 'pc1', 'intranet')).toBe('intranet.nave.local');
    expect(qualify(sim, 'pc1', 'WWW.Example.com.')).toBe('www.example.com');
    expect(qualify(sim, 'lap1', 'intranet')).toBeNull();
  });

  it('el controlador de dominio responde con autoridad los nombres de nave.local', async () => {
    const result = await resolveName(sim, 'pc1', 'intranet');
    expect(result).toMatchObject({ status: 'resolved', ip: '192.168.50.10', name: 'intranet.nave.local' });
    expect(dns).toEqual(['pc1:query', 'srv:response']);
  });

  it('para nombres externos el servidor pregunta a su reenviador y guarda la respuesta', async () => {
    await resolveName(sim, 'pc1', 'www.example.com');
    expect(dns).toEqual(['pc1:query', 'srv:query', 'internet:response', 'srv:response']);

    // Otro cliente pregunta lo mismo: el servidor ya lo tiene en caché y no sale a Internet
    dns.length = 0;
    await resolveName(sim, 'pc2', 'www.example.com');
    expect(dns).toEqual(['pc2:query', 'srv:response']);
  });

  it('el cliente usa su caché y no vuelve a preguntar', async () => {
    await resolveName(sim, 'pc1', 'intranet');
    dns.length = 0;
    expect(await resolveName(sim, 'pc1', 'intranet')).toMatchObject({ status: 'resolved', cached: true });
    expect(dns).toEqual([]);
  });

  it('NXDOMAIN cuando el nombre no existe en la zona', async () => {
    expect(await resolveName(sim, 'pc1', 'noexiste')).toMatchObject({ status: 'not-found' });
  });

  it('la red de invitados usa DNS público y no ve la zona interna (split DNS)', async () => {
    expect(await resolveName(sim, 'lap1', 'www.example.com')).toMatchObject({ ip: '93.184.215.14' });
    expect(await resolveName(sim, 'lap1', 'intranet.nave.local')).toMatchObject({ status: 'not-found' });
  });

  it('una IP no necesita resolución', async () => {
    expect(await resolveName(sim, 'pc1', '8.8.8.8')).toEqual({ status: 'resolved', ip: '8.8.8.8', name: '8.8.8.8' });
    expect(dns).toEqual([]);
  });

  describe('con el servicio DNS detenido', () => {
    beforeEach(() => sim.setServiceRunning('srv', 'DNS', false));

    it('la consulta muere en el puerto 53 y, tras reintentar, se agota el tiempo', async () => {
      expect(await resolveName(sim, 'pc1', 'www.example.com')).toMatchObject({ status: 'timeout' });
      expect(dns).toEqual(['pc1:query', 'pc1:query']);
    });

    it('el servidor sigue vivo: solo falla el DNS', async () => {
      const response = await lookup(sim, 'pc1', '192.168.50.10', 'intranet.nave.local');
      expect(response).toBeNull();
      expect((await echo(sim, 'pc1', '192.168.50.10')).status).toBe('reply');
    });
  });
});
