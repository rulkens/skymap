import { describe, expect, it } from 'vitest';
import { newLocalRoomCode } from '../../../src/utils/remote/newLocalRoomCode';

describe('newLocalRoomCode', () => {
  it('is eight Crockford base32 characters', () => {
    expect(newLocalRoomCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });
});
