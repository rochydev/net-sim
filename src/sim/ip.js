// Utilidades IPv4 puras (sin dependencias). Las usa el motor y también la UI.

export const ipToInt = (ip) => ip.split('.').reduce((acc, octet) => ((acc << 8) | Number(octet)) >>> 0, 0);

export const intToIp = (n) => [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join('.');

export const prefixToMask = (prefix) => intToIp(prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);

export const networkOf = (ip, prefix) => intToIp((ipToInt(ip) & ipToInt(prefixToMask(prefix))) >>> 0);

export const sameSubnet = (ipA, ipB, prefix) => networkOf(ipA, prefix) === networkOf(ipB, prefix);

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export const isIpv4 = (text) => IPV4.test(text);

export const isApipa = (ip) => ip?.startsWith('169.254.');
