import { describe, expect, it } from 'vitest';

import { selectingEntryOf } from '../../../src/utils/visibility/selectingEntryOf';
import type { VisibilityEntry } from '../../../src/@types/engine/layer/VisibilityEntry';

const ENTRIES: readonly VisibilityEntry[] = [
  { label: 'stellarStream', cluster: 'stellarStreams', of: 'stellarStreams' },
  { key: 'stellarStreams', selects: ['stellarStream'] },
];

describe('selectingEntryOf', () => {
  it('finds the show entry naming the kind, never a label entry', () => {
    expect(selectingEntryOf(ENTRIES, 'stellarStream')).toBe(ENTRIES[1]);
    expect(selectingEntryOf(ENTRIES, 'structure')).toBeUndefined();
  });
});
