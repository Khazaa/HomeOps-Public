import { describe, expect, it, vi } from 'vitest';
import { sendRemoteSize } from '../src/remoteSize';

describe('remote resize', () => {
  it('sends the new viewport size for SSH and RDP clients', () => {
    const client = { sendSize: vi.fn() };
    expect(sendRemoteSize(client, 1280.8, 719.9)).toBe(true);
    expect(client.sendSize).toHaveBeenCalledWith(1280, 719);
  });
  it('enforces a usable minimum size', () => {
    const client = { sendSize: vi.fn() };
    sendRemoteSize(client, 100, 100);
    expect(client.sendSize).toHaveBeenCalledWith(320, 200);
  });
});
