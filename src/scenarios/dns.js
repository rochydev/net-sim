// DNS: nombre interno (autoritativo), nombre externo (recursivo vía reenviador) y caché
export default {
  id: 'dns',
  title: 'DNS: resolución de nombres',
  description: 'Antes del ping, el nombre se traduce a IP: zona interna, reenviador y caché.',
  steps: [
    {
      caption: 'PC-OFI-01 vacía su caché DNS para empezar de cero.',
      run: async ({ focus, command }) => {
        focus('pc1');
        await command('pc1', 'ipconfig /flushdns');
      },
    },
    {
      caption:
        'Nombre corto "intranet": Windows añade el sufijo nave.local y SRV-DC01 responde con autoridad, es su zona.',
      run: ({ command }) => command('pc1', 'ping -n 1 intranet'),
    },
    {
      caption:
        'Nombre de Internet: SRV-DC01 no lo conoce, lo pregunta a 8.8.8.8 en nombre del PC y le pasa la respuesta.',
      run: ({ command }) => command('pc1', 'ping -n 1 www.example.com'),
    },
    {
      caption: 'Segunda vez: no sale ninguna consulta DNS, la respuesta está en la caché del equipo.',
      run: ({ command }) => command('pc1', 'ping -n 1 www.example.com'),
    },
  ],
};
