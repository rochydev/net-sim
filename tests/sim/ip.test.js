import { describe, it, expect } from 'vitest';
import { ipToInt, intToIp, prefixToMask, networkOf, sameSubnet, isApipa } from '../../src/sim/ip.js';

describe('ip', () => {
  it('convierte entre texto y entero sin perder el bit de signo', () => {
    expect(ipToInt('255.255.255.255')).toBe(4294967295);
    expect(intToIp(ipToInt('192.168.10.101'))).toBe('192.168.10.101');
  });

  it.each([
    [0, '0.0.0.0'],
    [16, '255.255.0.0'],
    [24, '255.255.255.0'],
    [30, '255.255.255.252'],
    [32, '255.255.255.255'],
  ])('/%i → %s', (prefix, mask) => {
    expect(prefixToMask(prefix)).toBe(mask);
  });

  it('calcula la red y compara subredes', () => {
    expect(networkOf('203.0.113.2', 30)).toBe('203.0.113.0');
    expect(sameSubnet('192.168.10.5', '192.168.10.200', 24)).toBe(true);
    expect(sameSubnet('192.168.10.5', '192.168.20.5', 24)).toBe(false);
  });

  it('reconoce direcciones APIPA', () => {
    expect(isApipa('169.254.12.3')).toBe(true);
    expect(isApipa('192.168.10.1')).toBe(false);
  });
});
