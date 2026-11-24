import { describe, expect, it } from 'vitest';
import { expandPrivateCidr, serviceForPort } from './network-scan.js';
import { scanPorts, scheduleDue, validTimezone } from './scheduled-scan.js';

describe('network scanner boundaries', () => {
  it('expands a private subnet without network and broadcast addresses', () => {
    expect(expandPrivateCidr('192.168.23.0/30')).toEqual(['192.168.23.1', '192.168.23.2']);
    expect(expandPrivateCidr('192.168.22.0/23')).toHaveLength(510);
  });
  it('rejects public and oversized networks', () => {
    expect(() => expandPrivateCidr('8.8.8.0/24')).toThrow('CIDR_NOT_PRIVATE');
    expect(() => expandPrivateCidr('192.168.0.0/16')).toThrow('CIDR_TOO_LARGE');
  });
  it('maps standard and custom ports to useful resource suggestions', () => {
    expect(serviceForPort(22).suggestedType).toBe('ssh');
    expect(serviceForPort(3389).suggestedType).toBe('rdp');
    expect(serviceForPort(8443)).toMatchObject({ suggestedType: 'web', scheme: 'https' });
    expect(serviceForPort(12345).service).toBe('unknown');
  });
});

describe('scheduled network scanner', () => {
  it('runs once per local day after the configured time', () => {
    const now = new Date('2026-11-24T03:30:00.000Z');
    expect(scheduleDue('04:00', 'Europe/Berlin', null, now)).toBe(true);
    expect(scheduleDue('06:00', 'Europe/Berlin', null, now)).toBe(false);
    expect(scheduleDue('04:00', 'Europe/Berlin', new Date('2026-11-24T02:00:00.000Z'), now)).toBe(false);
    expect(scheduleDue('04:00', 'Europe/Berlin', new Date('2026-11-23T02:00:00.000Z'), now)).toBe(true);
  });
  it('validates timezones and combines scan ports', () => {
    expect(validTimezone('Europe/Berlin')).toBe(true);
    expect(validTimezone('Nowhere/Invalid')).toBe(false);
    expect(scanPorts({ web: true, ssh: true, rdp: false, ports: [22, 8123] })).toEqual([22, 80, 443, 8080, 8123, 8443]);
  });
});
