import { describe, it, expect, beforeEach } from 'vitest';
import { topology } from '../../src/config/topology.js';
import { Simulator } from '../../src/sim/Simulator.js';
import { Shell } from '../../src/sim/shell/Shell.js';

describe('Shell', () => {
  let shell;
  const run = async (deviceId, line, options) => {
    const lines = [];
    for await (const l of shell.run(deviceId, line, options)) lines.push(l);
    return lines;
  };

  beforeEach(() => {
    shell = new Shell(new Simulator(topology, { random: () => 0.5 }));
  });

  it('imprime ping con el formato de Windows en castellano', async () => {
    const out = await run('pc1', 'ping -n 2 192.168.50.10');
    expect(out).toContain('Haciendo ping a 192.168.50.10 con 32 bytes de datos:');
    expect(out.filter((l) => /^Respuesta desde 192\.168\.50\.10: bytes=32 tiempo<1m TTL=127$/.test(l))).toHaveLength(2);
    expect(out).toContain('    Paquetes: enviados = 2, recibidos = 2, perdidos = 0');
  });

  it('cuenta "host inaccesible" como recibido, igual que Windows', async () => {
    const out = await run('pc1', 'ping -n 1 192.168.10.250');
    expect(out).toContain('Respuesta desde 192.168.10.101: Host de destino inaccesible.');
    expect(out).toContain('    Paquetes: enviados = 1, recibidos = 1, perdidos = 0');
  });

  it('ping -t se detiene con Ctrl+C', async () => {
    const controller = new AbortController();
    const lines = [];
    for await (const line of shell.run('pc1', 'ping -t 192.168.10.1', { signal: controller.signal })) {
      lines.push(line);
      if (lines.filter((l) => l.startsWith('Respuesta')).length === 3) controller.abort();
    }
    expect(lines).toContain('Control-C');
    expect(lines).toContain('    Paquetes: enviados = 3, recibidos = 3, perdidos = 0');
  });

  it('ipconfig muestra la configuración del equipo', async () => {
    const out = (await run('pc2', 'ipconfig')).join('\n');
    expect(out).toMatch(/Dirección IPv4[ .]+: 192\.168\.10\.102/);
    expect(out).toMatch(/Puerta de enlace predeterminada[ .]+: 192\.168\.10\.1/);
  });

  it('arp -a lista lo aprendido', async () => {
    expect(await run('pc1', 'arp -a')).toEqual(['No se encontraron entradas ARP.']);
    await run('pc1', 'ping -n 1 192.168.10.1');
    expect((await run('pc1', 'arp -a')).join('\n')).toMatch(/192\.168\.10\.1\s+00-09-0f-a1-00-10\s+dinámico/);
  });

  it('rechaza comandos desconocidos con el mensaje de cmd.exe', async () => {
    expect(await run('pc1', 'nslookup')).toEqual([
      '"nslookup" no se reconoce como un comando interno o externo,',
      'programa o archivo por lotes ejecutable.',
    ]);
  });
});
