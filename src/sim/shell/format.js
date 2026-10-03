// Windows escribe "tiempo<1m" por debajo de un milisegundo y "tiempo=12ms" por encima
export const pingTime = (ms) => (ms < 1 ? 'tiempo<1m' : `tiempo=${Math.floor(ms)}ms`);

// Columna de tiempo de tracert, de 9 caracteres: "    <1 ms", "   12 ms", "     *   "
export const traceTime = (ms) => (ms == null ? '     *   ' : (ms < 1 ? '<1 ms' : `${Math.round(ms)} ms`).padStart(9));

// Relleno de ipconfig: puntos en las columnas pares y espacios en las impares,
// por eso "Dirección IPv4. . ." pero "Máscara de subred . . .". Los ':' van siempre en la misma columna.
export function dotted(label, value, width = 42) {
  let text = label;
  for (let col = label.length; col < width; col++) text += col % 2 === 0 && col < width - 1 ? '.' : ' ';
  return `   ${text}: ${value}`;
}

export const dashedMac = (mac) => mac.replaceAll(':', '-');
