// Disposición física de la nave (solo para la escena 3D).
// Va separado de topology.js porque la posición de un equipo no es un dato de red:
// el motor de simulación nunca importa este archivo.

export const layout = {
  // Posición [x, z] en metros sobre el suelo. Los equipos miran hacia +z (la cámara).
  devices: {
    internet: [0, -18.5],
    fw: [3.4, -9.6],
    sw: [0, -6.4],
    srv: [-3.4, -9.4],
    pc1: [-2, 4],
    pc2: [1.7, 4],
    pc3: [5.4, 4],
    plc1: [-13, 4],
    cnc1: [-8.4, 4],
    lap1: [11.6, 4],
  },

  // Altura extra para equipos que "flotan" (la nube de Internet)
  elevation: { internet: 5 },

  // Zonas del suelo. vlan → color y nombre salen de topology.vlans
  zones: [
    { id: 'cpd', label: 'CPD', vlan: 50, x: [-6, 6.2], z: [-12, -4.6] },
    { id: 'prod', label: 'Producción', vlan: 20, x: [-15.5, -6], z: [1, 7.5] },
    { id: 'ofi', label: 'Oficinas', vlan: 10, x: [-4.4, 7.8], z: [1, 7.5] },
    { id: 'inv', label: 'Invitados', vlan: 30, x: [9.2, 14.2], z: [1, 7.5] },
  ],

  // Altura de la bandeja de cables sobre el suelo
  cableHeight: 0.035,
};
