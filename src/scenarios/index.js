import ping from './ping.js';
import dhcp from './dhcp.js';
import dhcpFailure from './dhcpFailure.js';

// Orden en el que aparecen en el menú
export const scenarios = [ping, dhcp, dhcpFailure];
