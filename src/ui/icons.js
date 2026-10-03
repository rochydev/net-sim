import {
  Activity,
  ChevronDown,
  Cloud,
  Factory,
  Laptop,
  ListChecks,
  Monitor,
  Network,
  Play,
  Plug,
  Power,
  RotateCcw,
  Server,
  Shield,
  Square,
  SquareTerminal,
  StepForward,
  Unplug,
  X,
} from 'lucide';

// Iconos de Lucide renderizados como texto SVG, para poder usarlos dentro de plantillas
const ICONS = {
  activity: Activity,
  chevronDown: ChevronDown,
  cloud: Cloud,
  factory: Factory,
  laptop: Laptop,
  scenarios: ListChecks,
  monitor: Monitor,
  network: Network,
  play: Play,
  plug: Plug,
  power: Power,
  stop: Square,
  next: StepForward,
  unplug: Unplug,
  reset: RotateCcw,
  server: Server,
  shield: Shield,
  terminal: SquareTerminal,
  close: X,
};

export const DEVICE_ICONS = {
  cloud: 'cloud',
  firewall: 'shield',
  switch: 'network',
  server: 'server',
  pc: 'monitor',
  industrial: 'factory',
  laptop: 'laptop',
};

export function icon(name, size = 16) {
  const node = ICONS[name];
  if (!node) throw new Error(`Icono desconocido: ${name}`);
  const children = node
    .map(([tag, attrs]) => {
      const attributes = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      return `<${tag} ${attributes}/>`;
    })
    .join('');
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
}
