// Averías físicas: un cable suelto afecta a un equipo; el switch caído, a toda la nave
export default {
  id: 'breakage',
  title: 'Averías: cable y switch',
  description: 'Un cable suelto deja sin red a un PC; si cae el switch, a toda la nave.',
  steps: [
    {
      caption: 'Se suelta el cable de PC-OFI-01. Windows lo detecta al momento: "medios desconectados".',
      run: async ({ focus, setLinkUp, command }) => {
        focus('pc1');
        setLinkUp('l-pc1', false);
        await command('pc1', 'ipconfig');
      },
    },
    {
      caption: 'Sin medio físico, ping ni siquiera envía el paquete: "Error general". Lo primero, revisar el cable.',
      run: ({ command }) => command('pc1', 'ping -n 1 192.168.10.1'),
    },
    {
      caption: 'Se reconecta el cable... y se cae SW-CORE-01. Es el punto único de fallo de esta red.',
      run: async ({ focus, setLinkUp, setDeviceUp, wait }) => {
        setLinkUp('l-pc1', true);
        await wait(800);
        focus('sw');
        setDeviceUp('sw', false);
        await wait(1500);
      },
    },
    {
      caption: 'PC-OFI-02 intenta llegar a su puerta de enlace: el ARP muere en el switch y nadie contesta.',
      run: async ({ focus, command }) => {
        focus('pc2');
        await command('pc2', 'ping -n 2 192.168.10.1');
      },
    },
    {
      caption: 'Vuelve el switch y la red se recupera sola, sin tocar ningún PC.',
      run: async ({ focus, setDeviceUp, command, wait }) => {
        focus('sw');
        setDeviceUp('sw', true);
        await wait(1000);
        focus('pc2');
        await command('pc2', 'ping -n 2 192.168.10.1');
      },
    },
  ],
};
