import { describe, expect, it } from 'vitest';
import { applyRdpSettings } from './remote-settings.js';

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
