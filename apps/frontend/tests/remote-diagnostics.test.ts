import { describe, expect, it } from 'vitest';
import { diagnosticFilename, formatRemoteDiagnostics } from '../src/remoteDiagnostics';
import type { Resource } from '../src/types';

const resource: Resource = { id: 'resource-a', type: 'ssh', name: 'Server A / Test', notes: '', tags: [], categoryId: null, icon: 'ssh', position: 0, enabled: true, hasSecret: true, hasLocalSecret: true, credentialId: null, config: { host: '192.168.1.10', port: 22, username: 'root' } };

describe('remote diagnostics', () => {
  it('formats useful connection details and redacts sensitive fields', () => {
    const text = formatRemoteDiagnostics(resource, [{ at: '2026-11-24T12:00:00.000Z', level: 'error', message: 'Tunnel abgebrochen', details: { code: 769, token: 'do-not-export', nested: { password: 'hidden' } } }], [], 'v0.1.17', 'Test Browser');
    expect(text).toContain('192.168.1.10:22');
    expect(text).toContain('Tunnel abgebrochen');
    expect(text).toContain('"token":"[REDACTED]"');
    expect(text).not.toContain('do-not-export');
    expect(text).not.toContain('hidden');
  });
  it('creates a filesystem-safe text filename', () => {
    expect(diagnosticFilename(resource)).toMatch(/^homeops-Server-A-Test-diagnose-.+\.txt$/);
  });
});
