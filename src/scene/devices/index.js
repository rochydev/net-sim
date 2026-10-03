import { createPC } from './pc.js';
import { createLaptop } from './laptop.js';
import { createSwitch } from './switch.js';
import { createFirewall } from './firewall.js';
import { createServer } from './server.js';
import { createIndustrial } from './industrial.js';
import { createCloud } from './cloud.js';

const BUILDERS = {
  pc: createPC,
  laptop: createLaptop,
  switch: createSwitch,
  firewall: createFirewall,
  server: createServer,
  industrial: createIndustrial,
  cloud: createCloud,
};

// Fábrica: tipo de dispositivo (dato de topology.js) → modelo 3D.
// Añadir un tipo nuevo = crear su archivo y registrarlo aquí.
// Cada modelo devuelve { group, height, ports, screens, leds }.
export function buildDeviceModel(type, options) {
  const builder = BUILDERS[type];
  if (!builder) throw new Error(`No hay modelo 3D para el tipo "${type}"`);
  return builder(options);
}
