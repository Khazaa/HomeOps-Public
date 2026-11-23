import { describe, expect, it } from 'vitest';
import { expandPrivateCidr, serviceForPort } from './network-scan.js';
describe('network scanner boundaries', () => {
  it('expands a private subnet without network and broadcast addresses', () => { expect(expandPrivateCidr('192.168.23.0/30')).toEqual(['192.168.23.1', '192.168.23.2']); expect(expandPrivateCidr('192.168.22.0/23')).toHaveLength(510); });
  it('rejects public and oversized networks', () => { expect(() => expandPrivateCidr('8.8.8.0/24')).toThrow('CIDR_NOT_PRIVATE'); expect(() => expandPrivateCidr('192.168.0.0/16')).toThrow('CIDR_TOO_LARGE'); });
  it('maps standard and custom ports to useful resource suggestions', () => { expect(serviceForPort(22).suggestedType).toBe('ssh'); expect(serviceForPort(3389).suggestedType).toBe('rdp'); expect(serviceForPort(8443)).toMatchObject({ suggestedType: 'web', scheme: 'https' }); expect(serviceForPort(12345).service).toBe('unknown'); });
});
