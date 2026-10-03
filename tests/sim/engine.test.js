import { describe, it, expect, beforeEach } from 'vitest';
import { topology } from '../../src/config/topology.js';
import { NetworkEngine } from '../../src/sim/NetworkEngine.js';
import { Packet, BROADCAST_MAC } from '../../src/sim/Packet.js';

const MAC = {
  pc1: 'D4:81:D7:1A:22:01',
  pc2: 'D4:81:D7:1A:22:02',
  gw10: '00:09:0F:A1:00:10',
  gw30: '00:09:0F:A1:00:30',
};

const echoRequest = (fields) =>
  new Packet({ protocol: 'icmp', kind: 'echo-request', ttl: 128, flowId: 'test', payload: { seq: 1 }, ...fields });

describe('NetworkEngine', () => {
  let engine;
  beforeEach(() => {
    engine = new NetworkEngine(topology);
  });

  describe('capa 2', () => {
    it('entrega dentro de la misma VLAN pasando solo por el switch', () => {
      const trace = engine.trace(
        echoRequest({ srcMac: MAC.pc1, dstMac: MAC.pc2, srcIp: '192.168.10.101', dstIp: '192.168.10.102' }),
        'pc1',
      );
      expect(trace.path).toEqual(['pc1', 'sw', 'pc2']);
      expect(trace.deliveredTo('pc2')).not.toBeNull();
    });

    it('limita un broadcast ARP a los puertos de su VLAN', () => {
      const arp = new Packet({
        protocol: 'arp',
        kind: 'request',
        srcMac: MAC.pc1,
        dstMac: BROADCAST_MAC,
        payload: { senderIp: '192.168.10.101', targetIp: '192.168.10.1' },
      });
      const reached = engine.trace(arp, 'pc1').nodes.map((n) => n.device);

      expect(reached).toEqual(expect.arrayContaining(['pc2', 'pc3', 'fw']));
      expect(reached).not.toContain('plc1');
      expect(reached).not.toContain('lap1');
      expect(engine.trace(arp, 'pc1').delivered.map((n) => n.device)).toEqual(['fw']);
    });

    it('etiqueta la trama en el trunk con la VLAN de origen', () => {
      const trace = engine.trace(
        echoRequest({ srcMac: MAC.pc1, dstMac: MAC.gw10, srcIp: '192.168.10.101', dstIp: '192.168.50.10' }),
        'pc1',
      );
      const trunkHop = trace.nodes.find((n) => n.hop?.link === 'trunk');
      expect(trunkHop.hop).toMatchObject({ vlan: 10, tagged: true });
    });
  });

  describe('capa 3 y firewall', () => {
    it('enruta entre VLANs, decrementa el TTL y registra la política aplicada', () => {
      const trace = engine.trace(
        echoRequest({ srcMac: MAC.pc1, dstMac: MAC.gw10, srcIp: '192.168.10.101', dstIp: '192.168.50.10' }),
        'pc1',
      );
      expect(trace.path).toEqual(['pc1', 'sw', 'fw', 'sw', 'srv']);
      const delivered = trace.deliveredTo('srv');
      expect(delivered.frame.ttl).toBe(127);
      expect(delivered.frame.srcMac).toBe('00:09:0F:A1:00:50');
      expect(trace.nodes.find((n) => n.device === 'fw').notes[0].text).toMatch(/Política #1/);
    });

    it('descarta Invitados → Producción por la política implícita', () => {
      const trace = engine.trace(
        echoRequest({ srcMac: '3C:22:FB:9A:30:64', dstMac: MAC.gw30, srcIp: '192.168.30.100', dstIp: '192.168.20.11' }),
        'lap1',
      );
      expect(trace.failure).toMatchObject({ device: 'fw', outcome: 'dropped' });
      expect(trace.failure.data.policy).toBe(0);
    });

    it('permite Invitados → Producción al activar la política #4', () => {
      engine.setPolicyEnabled('fw', 4, true);
      const trace = engine.trace(
        echoRequest({ srcMac: '3C:22:FB:9A:30:64', dstMac: MAC.gw30, srcIp: '192.168.30.100', dstIp: '192.168.20.11' }),
        'lap1',
      );
      expect(trace.deliveredTo('plc1')).not.toBeNull();
    });

    it('deja pasar la respuesta de una sesión abierta aunque ninguna política la permita', () => {
      engine.trace(
        echoRequest({ srcMac: MAC.pc1, dstMac: MAC.gw10, srcIp: '192.168.10.101', dstIp: '192.168.50.10' }),
        'pc1',
      );
      const reply = new Packet({
        protocol: 'icmp',
        kind: 'echo-reply',
        srcIp: '192.168.50.10',
        dstIp: '192.168.10.101',
        ttl: 128,
        flowId: 'test',
      });
      expect(engine.trace(reply, 'srv').deliveredTo('pc1')).not.toBeNull();

      const unsolicited = reply.with({ flowId: 'otra-sesion', kind: 'echo-request' });
      expect(engine.trace(unsolicited, 'srv').failure?.outcome).toBe('dropped');
    });

    it('aplica NAT a la salida y lo deshace en la respuesta', () => {
      const out = engine.trace(
        echoRequest({ srcMac: MAC.pc1, dstMac: MAC.gw10, srcIp: '192.168.10.101', dstIp: '8.8.8.8' }),
        'pc1',
      );
      const atInternet = out.deliveredTo('internet');
      expect(atInternet.frame.srcIp).toBe('203.0.113.2');

      const reply = new Packet({
        protocol: 'icmp',
        kind: 'echo-reply',
        srcIp: '8.8.8.8',
        dstIp: '203.0.113.2',
        ttl: 125,
        flowId: 'test',
      });
      const back = engine.trace(reply, 'internet').deliveredTo('pc1');
      expect(back.frame.dstIp).toBe('192.168.10.101');
      expect(back.frame.ttl).toBe(124);
    });

    it('responde "TTL agotado" desde la interfaz de entrada del router', () => {
      const trace = engine.trace(
        echoRequest({ srcMac: MAC.pc1, dstMac: MAC.gw10, srcIp: '192.168.10.101', dstIp: '8.8.8.8', ttl: 1 }),
        'pc1',
      );
      expect(trace.failure).toMatchObject({
        device: 'fw',
        outcome: 'ttl-exceeded',
        data: { replyFrom: '192.168.10.1' },
      });
    });
  });

  describe('fallos', () => {
    it('pierde la trama si el destino está apagado', () => {
      engine.device('pc2').up = false;
      const trace = engine.trace(
        echoRequest({ srcMac: MAC.pc1, dstMac: MAC.pc2, srcIp: '192.168.10.101', dstIp: '192.168.10.102' }),
        'pc1',
      );
      expect(trace.failure).toMatchObject({ device: 'pc2', outcome: 'dropped' });
    });

    it('no reenvía nada si el switch está caído', () => {
      engine.device('sw').up = false;
      const trace = engine.trace(
        echoRequest({ srcMac: MAC.pc1, dstMac: MAC.pc2, srcIp: '192.168.10.101', dstIp: '192.168.10.102' }),
        'pc1',
      );
      expect(trace.path).toEqual(['pc1', 'sw']);
      expect(trace.deliveredTo('pc2')).toBeNull();
    });
  });
});
