import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const required = {
  MASTER_KEY: Buffer.alloc(32, 7).toString('base64url'),
  GUAC_TOKEN_KEY: 'independent-test-token-key-123456789'
};

describe('configuration', () => {
  it('normalizes APP_ORIGIN without weakening the origin boundary', () => {
    expect(loadConfig({ ...required, APP_ORIGIN: 'https://homeops.example.lan/' }).APP_ORIGIN).toBe('https://homeops.example.lan');
    expect(loadConfig({ ...required, APP_ORIGIN: 'https://homeops.example.lan/path?ignored=true' }).APP_ORIGIN).toBe('https://homeops.example.lan');
    expect(loadConfig({ ...required, APP_ORIGIN: 'https://homeops.example.lan:8443/' }).APP_ORIGIN).toBe('https://homeops.example.lan:8443');
  });
});
