import { describe, expect, it } from 'vitest';
import { readRoomCode } from '../../../src/main/relay/readRoomCode';
import { memorySettings } from '../settings/memorySettings';

describe('readRoomCode', () => {
  it('creates and stores a code on first read', () => {
    const { settings, values } = memorySettings();
    const code = readRoomCode(settings);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(values.get('roomCode')).toBe(code);
  });

  it('returns the same code on the next read', () => {
    const { settings } = memorySettings();
    const code = readRoomCode(settings);
    expect(readRoomCode(settings)).toBe(code);
  });

  it('replaces a stored value that is not a code', () => {
    const { settings } = memorySettings({ roomCode: { code: 1 } });
    expect(readRoomCode(settings)).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });
});
