import { describe, expect, it } from 'vitest';
import {
  STRONG_RECESSION,
  focusRecession,
} from '../../../../src/services/engine/presentation/focusRecession';

describe('focusRecession', () => {
  it('returns the exact target for a tagged handle at blend 1', () => {
    expect(focusRecession({ kind: 'cosmicWebFilaments' }, 1)).toBe(STRONG_RECESSION);
  });
});
