import { describe, expect, it } from 'vitest';

import { reanchorWrites } from '../../../src/utils/selection/reanchorWrites';
import type { FocusResolution } from '../../../src/@types/engine/selection/FocusResolution';

const AT_7 = { type: 'galaxyCatalog', source: 'sdss', index: 7 };
const NO_IDS = { hover: null, select: null, focus: null };
const NO_REFS = { hover: null, select: null, focus: null };

const answering = (r: FocusResolution) => () => r;

describe('reanchorWrites', () => {
  it('pending leaves the slot alone', () => {
    const writes = reanchorWrites(
      { ...NO_IDS, select: 'sdss-1' },
      { ...NO_REFS, select: AT_7 },
      answering({ kind: 'pending' }),
    );
    expect(writes).toEqual([]);
  });

  it('a slot without an id is skipped', () => {
    // A ref whose row never resolved has no id; the gap-fill owns that slot, not the re-anchor.
    const writes = reanchorWrites(NO_IDS, { ...NO_REFS, select: AT_7 }, () => {
      throw new Error('resolved an empty slot');
    });
    expect(writes).toEqual([]);
  });
});
