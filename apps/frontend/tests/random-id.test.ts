import { describe, expect, it, vi } from 'vitest';
import { randomId } from '../src/randomId';

describe('randomId', () => {
  it('uses randomUUID when the browser exposes it', () => {
    const randomUUID = vi.fn(() => 'native-id');
    expect(randomId({ randomUUID, getRandomValues: vi.fn() as Crypto['getRandomValues'] })).toBe('native-id');
  });

  it('creates a UUID on non-secure HTTP origins without randomUUID', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.set(Array.from({ length: 16 }, (_, index) => index));
      return bytes;
    });
    expect(randomId({ getRandomValues: getRandomValues as Crypto['getRandomValues'] })).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });
});
