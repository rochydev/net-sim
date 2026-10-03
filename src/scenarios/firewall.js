// VLANs y firewall: Invitados no llega a Producción hasta que se activa una política
export default {
  id: 'firewall',
  title: 'VLANs y firewall',
  description: 'Invitados intenta llegar a Producción: deny implícito, y una política que lo permite.',
  steps: [
    {
      caption:
        'INVITADO-01 (VLAN 30) hace ping a PLC-LINEA-01 (VLAN 20). Comparten switch, pero cada VLAN es una red separada.',
      run: async ({ focus, command }) => {
        focus('lap1');
        await command('lap1', 'ping -n 2 192.168.20.11');
      },
    },
    {
      caption: 'El paquete solo puede cruzar por el firewall, y ninguna política lo permite: deny implícito.',
      run: async ({ select, wait }) => {
        select('fw');
        await wait(3500);
      },
    },
    {
      caption: 'Se activa la política #5: Invitados → Producción, solo PING. Típica regla temporal para soporte.',
      run: async ({ setPolicyEnabled, note, wait }) => {
        setPolicyEnabled('fw', 5, true);
        note('fw', 'Política #5 activada', 'success');
        await wait(1500);
      },
    },
    {
      caption: 'Ahora el ping pasa. La respuesta vuelve sin otra regla: el firewall reconoce la sesión abierta.',
      run: async ({ focus, command }) => {
        focus('lap1');
        await command('lap1', 'ping -n 2 192.168.20.11');
      },
    },
    {
      caption: 'Terminado el soporte, la regla se desactiva y Producción vuelve a quedar aislada.',
      run: async ({ select, setPolicyEnabled, note, wait }) => {
        select('fw');
        setPolicyEnabled('fw', 5, false);
        note('fw', 'Política #5 desactivada', 'warning');
        await wait(2500);
      },
    },
  ],
};
