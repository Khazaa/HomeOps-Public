import { describe, expect, it } from 'vitest';
import { applyRdpSettings, remoteUsername } from './remote-settings.js';

describe('RDP connection settings', () => {
  it('passes the configured server keyboard layout to guacd', () => {
    expect(applyRdpSettings({}, { keyboardLayout: 'de-de-qwertz', security: 'nla' })).toMatchObject({
      'server-layout': 'de-de-qwertz',
      security: 'nla',
      'resize-method': 'display-update'
    });
  });

  it('keeps legacy resources on the Guacamole default layout', () => {
    expect(applyRdpSettings({}, { keyboardLayout: 'invalid' })['server-layout']).toBe('en-us-qwerty');
  });
});

describe('remote username', () => {
  it('allows an incomplete SSH resource to be stored but blocks connecting it', () => {
    expect(() => remoteUsername('ssh', undefined, '')).toThrow('SSH_USERNAME_REQUIRED');
    expect(remoteUsername('ssh', undefined, ' root ')).toBe('root');
    expect(remoteUsername('ssh', 'credential-user', '')).toBe('credential-user');
  });
  it('keeps the optional RDP username behavior', () => {
    expect(remoteUsername('rdp', undefined, '')).toBe('');
  });
});
