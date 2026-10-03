import { ping } from './commands/ping.js';
import { tracert } from './commands/tracert.js';
import { ipconfig } from './commands/ipconfig.js';
import { arp } from './commands/arp.js';

const SHELL_TYPES = new Set(['pc', 'laptop', 'server']);

const COMMANDS = {
  ping,
  tracert,
  ipconfig,
  arp,
  help,
};

export const canRunShell = (device) => SHELL_TYPES.has(device.type);

// Línea de comandos de un equipo Windows simulado.
// run() es un generador asíncrono: va entregando líneas a medida que el comando avanza,
// así la terminal muestra cada respuesta de ping en cuanto vuelve el paquete.
export class Shell {
  constructor(sim) {
    this.sim = sim;
  }

  prompt(deviceId) {
    const user = this.sim.engine.device(deviceId).type === 'server' ? 'Administrador' : 'soporte';
    return `C:\\Users\\${user}>`;
  }

  banner() {
    return [
      'Microsoft Windows [Versión 10.0.22631.4317]',
      '(c) Microsoft Corporation. Todos los derechos reservados.',
      '',
    ];
  }

  async *run(deviceId, line, { signal } = {}) {
    const [name, ...args] = tokenize(line);
    if (!name) return;

    const command = COMMANDS[name.toLowerCase().replace(/\.exe$/, '')];
    if (!command) {
      yield `"${name}" no se reconoce como un comando interno o externo,`;
      yield 'programa o archivo por lotes ejecutable.';
      return;
    }
    yield* command({ sim: this.sim, deviceId, args, signal });
  }
}

async function* help() {
  yield 'Comandos disponibles en esta simulación:';
  yield '';
  yield '  ipconfig [/all]          Configuración IP del equipo';
  yield '  ping [-n N] [-t] [-i TTL] <IP>';
  yield '                           Comprueba la conectividad con otro equipo';
  yield '  tracert <IP>             Muestra los routers hasta el destino';
  yield '  arp -a                   Muestra la caché ARP';
  yield '  cls                      Limpia la pantalla';
  yield '';
  yield 'Ctrl+C detiene el comando en curso.';
}

const tokenize = (line) => line.trim().split(/\s+/).filter(Boolean);
