import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import { contentSecurityPolicy } from './csp.js';

describe('content security policy', () => {
  it('allows HTTP and HTTPS frames without upgrading LAN HTTP targets', async () => {
    const app = Fastify();
    await app.register(helmet, { contentSecurityPolicy });
    app.get('/', async () => 'ok');
    const response = await app.inject('/');
    expect(response.headers['content-security-policy']).toContain("frame-src 'self' http: https:");
    expect(response.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    await app.close();
  });
});
