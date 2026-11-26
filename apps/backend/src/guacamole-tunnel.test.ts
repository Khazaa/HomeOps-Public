import { afterEach, describe, expect, it } from 'vitest';
import { createGuacamoleTunnel } from './guacamole-tunnel.js';

describe('createGuacamoleTunnel', () => {
  let tunnel: any;

  afterEach(() => tunnel?.close());

  it('creates a noServer WebSocket server without binding a second port', () => {
    tunnel = createGuacamoleTunnel({
      verifyClient: (_info, done) => done(true),
      guacdHost: '127.0.0.1',
      guacdPort: 4822,
      tokenKey: '01234567890123456789012345678901',
      processConnectionSettings: (settings, callback) => callback(null, settings),
    });

    expect(tunnel.webSocketServer.options.noServer).toBe(true);
    expect(tunnel.webSocketServer.options.port).toBeNull();
  });
});
