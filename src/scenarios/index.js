import ping from './ping.js';
import dhcp from './dhcp.js';
import dhcpFailure from './dhcpFailure.js';
import dns from './dns.js';
import dnsFailure from './dnsFailure.js';
import firewall from './firewall.js';

// Orden en el que aparecen en el menú
export const scenarios = [ping, dhcp, dhcpFailure, dns, dnsFailure, firewall];
