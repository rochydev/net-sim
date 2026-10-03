// DHCP: release y renew completos (DORA) a través del relay del firewall
export default {
  id: 'dhcp',
  title: 'DHCP: proceso DORA',
  description: 'Un PC libera su IP y pide otra: Discover, Offer, Request y ACK.',
  steps: [
    {
      caption: 'PC-OFI-02 libera su concesión: envía un DHCP Release al servidor y se queda sin IP.',
      run: async ({ focus, command }) => {
        focus('pc2');
        await command('pc2', 'ipconfig /release');
      },
    },
    {
      caption:
        'Pide una IP nueva por broadcast. El servidor está en otra VLAN, así que el firewall hace de DHCP relay.',
      run: ({ command }) => command('pc2', 'ipconfig /renew'),
    },
    {
      caption: 'Discover → Offer → Request → ACK: vuelve a tener IP, máscara, puerta de enlace y DNS.',
      run: ({ command }) => command('pc2', 'ipconfig /all'),
    },
  ],
};
