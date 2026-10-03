// Fallo de DHCP: servidor caído → APIPA → sin conectividad → recuperación
export default {
  id: 'dhcp-failure',
  title: 'Fallo de DHCP (APIPA)',
  description: 'Se cae el servidor y un PC acaba en 169.254.x.x sin salir de su red.',
  steps: [
    {
      caption: 'Se cae SRV-DC01, el servidor DHCP de la nave.',
      run: async ({ focus, setDeviceUp, wait }) => {
        focus('srv');
        setDeviceUp('srv', false);
        await wait(1200);
      },
    },
    {
      caption: 'PC-OFI-03 renueva su IP: el relay reenvía cada Discover, pero nadie contesta. Windows reintenta.',
      run: async ({ focus, command }) => {
        focus('pc3');
        await command('pc3', 'ipconfig /release');
        await command('pc3', 'ipconfig /renew');
      },
    },
    {
      caption: 'Sin respuesta, Windows se autoasigna una dirección APIPA (169.254.x.x/16) sin puerta de enlace.',
      run: ({ command }) => command('pc3', 'ipconfig'),
    },
    {
      caption: 'Sin puerta de enlace no puede salir de su subred: ni servidor ni Internet. Síntoma típico en soporte.',
      run: ({ command }) => command('pc3', 'ping -n 1 192.168.50.10'),
    },
    {
      caption: 'Vuelve el servidor: un nuevo /renew completa el DORA y el equipo recupera su IP de siempre.',
      run: async ({ focus, setDeviceUp, command, wait }) => {
        focus('srv');
        setDeviceUp('srv', true);
        await wait(1000);
        focus('pc3');
        await command('pc3', 'ipconfig /renew');
      },
    },
  ],
};
