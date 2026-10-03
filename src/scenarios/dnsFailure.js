// Fallo de DNS: "no tengo Internet", pero la red funciona; lo que falla es la resolución
export default {
  id: 'dns-failure',
  title: 'Fallo de DNS',
  description: 'El ping a la IP funciona, pero al nombre no. Diagnóstico con nslookup.',
  steps: [
    {
      caption: 'Se detiene el servicio DNS en SRV-DC01. El servidor sigue encendido y en red.',
      run: async ({ focus, setServiceRunning, note, wait }) => {
        focus('srv');
        setServiceRunning('srv', 'DNS', false);
        note('srv', 'Servicio DNS detenido', 'danger');
        await wait(1500);
      },
    },
    {
      caption: 'Un usuario de PC-OFI-02 llama: "no tengo Internet". Primera prueba, por nombre.',
      run: async ({ focus, command }) => {
        focus('pc2');
        await command('pc2', 'ping -n 1 www.example.com');
      },
    },
    {
      caption: 'Por IP sí responde: la red y la salida a Internet funcionan. El problema es la resolución de nombres.',
      run: ({ command }) => command('pc2', 'ping -n 1 93.184.215.14'),
    },
    {
      caption: 'nslookup lo confirma: el servidor DNS no contesta.',
      run: ({ command }) => command('pc2', 'nslookup www.example.com'),
    },
    {
      caption: 'Se vuelve a iniciar el servicio DNS y el nombre resuelve de nuevo.',
      run: async ({ focus, setServiceRunning, note, command, wait }) => {
        focus('srv');
        setServiceRunning('srv', 'DNS', true);
        note('srv', 'Servicio DNS iniciado', 'success');
        await wait(1200);
        focus('pc2');
        await command('pc2', 'ping -n 1 www.example.com');
      },
    },
  ],
};
