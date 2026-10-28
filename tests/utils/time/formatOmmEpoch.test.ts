import { describe, expect, it } from 'vitest';
import { formatOmmEpoch } from '../../../src/utils/time/formatOmmEpoch';
import { parseOmmEpochMs } from '../../../tools/utils/time/parseOmmEpochMs';

describe('formatOmmEpoch', () => {
  it('writes back exactly the epoch string the catalog was built from', () => {
    for (const epoch of [
      '2026-10-27T03:45:44.572896',
      '2026-01-01T00:00:00.000000',
      '2025-12-31T23:59:59.999999',
    ]) {
      expect(formatOmmEpoch(parseOmmEpochMs(epoch))).toBe(epoch);
    }
  });
});
