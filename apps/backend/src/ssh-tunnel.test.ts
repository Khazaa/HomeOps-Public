import { describe, expect, it } from 'vitest';
import { isSshTunnelPath, knownHostKeyMatches, SshTicketStore } from './ssh-tunnel.js';

describe('SSH tunnel path', () => {
  it('uses the established tunnel prefix and keeps the initial path as an alias', () => {
    expect(isSshTunnelPath('/api/v1/tunnel/ssh')).toBe(true);
    expect(isSshTunnelPath('/api/v1/ssh')).toBe(true);
    expect(isSshTunnelPath('/api/v1/tunnel')).toBe(false);
  });
});

describe('SSH tunnel tickets', () => {
  const ticket = { userId: 'user-1', auditId: 'audit-1', host: 'server.lan', port: 22, username: 'root', authType: 'password' as const, secret: 'secret', verifyHostKey: true, hostKey: 'server.lan ssh-ed25519 AQID', cols: 80, rows: 24 };

  it('consumes a ticket exactly once and binds it to the user', () => {
    const store = new SshTicketStore();
    const token = store.issue(ticket);
    expect(store.consume(token, 'other-user')).toBeUndefined();
    expect(store.consume(token, 'user-1')).toBeUndefined();
  });

  it('returns the ticket to the intended user', () => {
    const store = new SshTicketStore();
    const token = store.issue(ticket);
    expect(store.consume(token, 'user-1')).toMatchObject(ticket);
    expect(store.consume(token, 'user-1')).toBeUndefined();
  });
});

describe('SSH host key verification', () => {
  it('compares the key blob from known_hosts in constant time', () => {
    expect(knownHostKeyMatches('[server.lan]:22 ssh-ed25519 AQIDBA==', Buffer.from([1, 2, 3, 4]))).toBe(true);
    expect(knownHostKeyMatches('[server.lan]:22 ssh-ed25519 AQIDBA==', Buffer.from([1, 2, 3, 5]))).toBe(false);
    expect(knownHostKeyMatches('invalid', Buffer.from([1, 2, 3, 4]))).toBe(false);
  });
});
