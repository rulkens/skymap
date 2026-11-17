import { describe, expect, it } from 'vitest';
import { isRecedingFocusRow } from '../../../src/utils/selection/isRecedingFocusRow';

describe('isRecedingFocusRow', () => {
  it('claims a row by its focusRegion, whichever region it declares', () => {
    const stream = { type: 'stellarStream', focusRegion: 'subjectOnly' } as const;
    expect(isRecedingFocusRow(stream)).toBe(true);
    expect(isRecedingFocusRow({ type: 'galaxy' })).toBe(false);
    expect(isRecedingFocusRow(null)).toBe(false);
  });
});
