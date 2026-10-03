import { describe, it, expect, beforeEach } from 'vitest';
import { topology } from '../../src/config/topology.js';
import { Simulator } from '../../src/sim/Simulator.js';
import { release, renew } from '../../src/sim/protocols/dhcp.js';
import { echo } from '../../src/sim/protocols/icmp.js';

describe('DHCP', () => {
  let sim;
  let sent;
  beforeEach(() => {
    sim = new Simulator(topology, { random: () => 0.5 });
    sent = [];
    sim.events.on('trace', ({ packet, trace }) => sent.push({ packet, trace }));
  });

  const dhcpKinds = () => sent.filter((s) => s.packet.protocol === 'dhcp').map((s) => s.packet.kind);
  const iface = (id) => sim.engine.device(id).ifaces[0];

  it('release deja el equipo sin IP y libera la concesión en el servidor', async () => {
    await release(sim, 'pc1');
    expect(iface('pc1')).toMatchObject({ ip: null, gateway: null });
    expect(dhcpKinds()).toEqual(['release']);
    expect(sim.engine.device('srv').leases.get('D4:81:D7:1A:22:01').active).toBe(false);
  });

  it('sin IP hace el proceso DORA completo a través del relay del firewall', async () => {
    await release(sim, 'pc1');
    sent.length = 0;

    const result = await renew(sim, 'pc1');
    expect(result).toEqual({ status: 'bound', ip: '192.168.10.101' });
    expect(dhcpKinds()).toEqual(['discover', 'offer', 'request', 'ack']);
    expect(iface('pc1')).toMatchObject({ gateway: '192.168.10.1', dns: '192.168.50.10', prefix: 24 });

    // El Discover sale en broadcast y el firewall lo reenvía como unicast al servidor
    const discover = sent[0].trace;
    const atFirewall = discover.nodes.find((n) => n.device === 'fw');
    expect(atFirewall.outcome).toBe('relayed');
    expect(discover.deliveredTo('srv').frame).toMatchObject({ srcIp: '192.168.10.1', dstIp: '192.168.50.10' });
    expect(discover.deliveredTo('srv').frame.payload.giaddr).toBe('192.168.10.1');
    // El resto de equipos de la VLAN reciben el broadcast pero no tienen el servicio
    expect(discover.nodes.filter((n) => n.outcome === 'discarded').map((n) => n.device)).toEqual(
      expect.arrayContaining(['pc2', 'pc3']),
    );
  });

  it('con concesión vigente renueva por unicast, sin Discover', async () => {
    await renew(sim, 'pc2');
    expect(dhcpKinds()).toEqual(['request', 'ack']);
    expect(iface('pc2').ip).toBe('192.168.10.102');
  });

  it('elige el ámbito según la VLAN del cliente', async () => {
    await release(sim, 'lap1');
    await renew(sim, 'lap1');
    expect(iface('lap1')).toMatchObject({ ip: '192.168.30.100', gateway: '192.168.30.1', dns: '1.1.1.1' });
  });

  it('asigna la primera IP libre a un cliente sin concesión previa', async () => {
    const server = sim.engine.device('srv');
    server.leases.delete('D4:81:D7:1A:22:03');
    server.leases.set('AA:AA:AA:AA:AA:AA', { ip: '192.168.10.100', active: true });
    await release(sim, 'pc3');
    expect(await renew(sim, 'pc3')).toEqual({ status: 'bound', ip: '192.168.10.103' });
  });

  describe('con el servidor caído', () => {
    beforeEach(async () => {
      await release(sim, 'pc1');
      sim.setDeviceUp('srv', false);
      sent.length = 0;
    });

    it('reintenta el Discover y acaba en APIPA', async () => {
      const result = await renew(sim, 'pc1');
      expect(result.status).toBe('apipa');
      expect(result.ip).toMatch(/^169\.254\.\d+\.\d+$/);
      expect(dhcpKinds()).toEqual(['discover', 'discover', 'discover']);
      expect(iface('pc1')).toMatchObject({ prefix: 16, gateway: null });
    });

    it('con APIPA no hay salida de la subred', async () => {
      await renew(sim, 'pc1');
      expect(await echo(sim, 'pc1', '192.168.50.10')).toEqual({ status: 'no-route' });
    });

    it('al volver el servidor recupera su IP de siempre', async () => {
      await renew(sim, 'pc1');
      sim.setDeviceUp('srv', true);
      expect(await renew(sim, 'pc1')).toEqual({ status: 'bound', ip: '192.168.10.101' });
    });
  });

  it('un equipo con IP fija no usa DHCP', async () => {
    expect(await renew(sim, 'srv')).toEqual({ status: 'static' });
  });

  it('reset devuelve la red a su estado inicial', async () => {
    await release(sim, 'pc1');
    sim.setDeviceUp('srv', false);
    sim.reset();
    expect(iface('pc1').ip).toBe('192.168.10.101');
    expect(sim.engine.device('srv').up).toBe(true);
  });
});
