import { describe, expect, it } from 'vitest';
import { newLocalRoomCode } from '../../../src/utils/remote/newLocalRoomCode';

describe('newLocalRoomCode', () => {
  it('is eight Crockford base32 characters', () => {
    expect(newLocalRoomCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it('uses the random source it is handed', () => {
    const fixed = (bytes: Uint8Array): Uint8Array => bytes.map((_, i) => i * 4);
    expect(newLocalRoomCode(fixed)).toBe('048CGMRW');
  });
});
