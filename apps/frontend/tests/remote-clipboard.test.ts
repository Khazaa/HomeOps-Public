import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendText = vi.fn();
const sendEnd = vi.fn();
vi.mock('guacamole-common-js', () => ({
  default: { StringWriter: vi.fn(function StringWriter() { return { sendText, sendEnd }; }) },
}));

import { sendClipboardText } from '../src/remoteClipboard';

describe('remote clipboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends pasted text through a Guacamole clipboard stream', () => {
    const client = { createClipboardStream: vi.fn(() => ({})) };
    expect(sendClipboardText(client, 'docker compose up -d')).toBe(true);
    expect(client.createClipboardStream).toHaveBeenCalledWith('text/plain;charset=utf-8');
    expect(sendText).toHaveBeenCalledWith('docker compose up -d');
    expect(sendEnd).toHaveBeenCalledOnce();
  });

  it('ignores empty clipboard content', () => {
    expect(sendClipboardText({}, '')).toBe(false);
  });
});
