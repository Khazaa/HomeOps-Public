import { describe, expect, it, vi } from 'vitest';
import { RemoteKeyboardController } from '../src/remoteKeyboard';

describe('remote keyboard', () => {
  it('lets the browser handle Ctrl+V without sending V to the remote host', () => {
    const client = { sendKeyEvent: vi.fn() };
    const keyboard = new RemoteKeyboardController(client);
    expect(keyboard.keyDown(0xffe3)).toBe(false);
    expect(keyboard.keyDown(0x76)).toBe(true);
    expect(keyboard.keyUp(0x76)).toBe(true);
    expect(keyboard.keyUp(0xffe3)).toBe(false);
    expect(client.sendKeyEvent.mock.calls).toEqual([[1, 0xffe3], [0, 0xffe3]]);
  });

  it('forwards ordinary keystrokes', () => {
    const client = { sendKeyEvent: vi.fn() };
    const keyboard = new RemoteKeyboardController(client);
    expect(keyboard.keyDown(0x61)).toBe(false);
    expect(keyboard.keyUp(0x61)).toBe(false);
    expect(client.sendKeyEvent.mock.calls).toEqual([[1, 0x61], [0, 0x61]]);
  });
});
