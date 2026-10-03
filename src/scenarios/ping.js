// Ping entre VLANs: ARP con la puerta de enlace, enrutado en el firewall y TTL
export default {
  id: 'ping',
  title: 'Ping entre VLANs',
  description: 'De Oficinas al servidor: ARP, enrutamiento en el firewall y TTL.',
  steps: [
    {
      caption: 'PC-OFI-01 (VLAN 10) va a hacer ping a SRV-DC01, que está en la VLAN 50.',
      run: async ({ focus, command }) => {
        focus('pc1');
        await command('pc1', 'arp -d *');
      },
    },
    {
      caption:
        'El destino está en otra red: primero pregunta por ARP la MAC de su puerta de enlace y después envía el Echo Request.',
      run: ({ command }) => command('pc1', 'ping -n 2 192.168.50.10'),
    },
    {
      caption: 'TTL=127: Windows envía con 128 y el firewall resta 1 al enrutar. La MAC aprendida queda en la caché.',
      run: ({ command }) => command('pc1', 'arp -a'),
    },
  ],
};
