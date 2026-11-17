import { describe, expect, it } from 'vitest';

import { decodePackedEpoch } from '../../../tools/asteroids/decodePackedEpoch';

describe('decodePackedEpoch', () => {
  it('reads K2555 (2025 May 5.0 TT)', () => {
    expect(decodePackedEpoch('K2555')).toBe(2460800.5);
  });

  it('reads the doc’s K01AM (2001 Oct. 22) and J969U (1996 Sept. 30)', () => {
    expect(decodePackedEpoch('K01AM')).toBe(2452204.5);
    expect(decodePackedEpoch('J969U')).toBe(2450356.5);
  });

  it('refuses a month past December', () => {
    expect(() => decodePackedEpoch('K26D1')).toThrow();
  });
});
