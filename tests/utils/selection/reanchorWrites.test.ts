import { describe, expect, it } from 'vitest';

import { reanchorWrites } from '../../../src/utils/selection/reanchorWrites';
import type { FocusResolution } from '../../../src/@types/engine/selection/FocusResolution';

const AT_7 = { type: 'galaxyCatalog', source: 'sdss', index: 7 };
const AT_42 = { type: 'galaxyCatalog', source: 'sdss', index: 42 };
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

  it('absent clears the slot', () => {
    const writes = reanchorWrites(
      { ...NO_IDS, focus: 'sdss-1' },
      { ...NO_REFS, focus: AT_7 },
      answering({ kind: 'absent' }),
    );
    expect(writes).toEqual([{ slot: 'focus', ref: null }]);
  });

  it('a hit on the same ref writes nothing', () => {
    // A fresh but equal object: identity must not decide, or every pulse re-flies the camera.
    const writes = reanchorWrites(
      { ...NO_IDS, focus: 'sdss-1' },
      { ...NO_REFS, focus: AT_7 },
      answering({ kind: 'hit', ref: { ...AT_7 } }),
    );
    expect(writes).toEqual([]);
  });

  it('a hit on a different ref rewrites the slot', () => {
    const writes = reanchorWrites(
      { hover: 'sdss-1', select: 'sdss-1', focus: null },
      { hover: AT_7, select: AT_7, focus: null },
      answering({ kind: 'hit', ref: AT_42 }),
    );
    expect(writes).toEqual([
      { slot: 'hover', ref: AT_42 },
      { slot: 'select', ref: AT_42 },
    ]);
  });

  it('a slot without an id is skipped', () => {
    // A ref whose row never resolved has no id; the gap-fill owns that slot, not the re-anchor.
    const writes = reanchorWrites(NO_IDS, { ...NO_REFS, select: AT_7 }, () => {
      throw new Error('resolved an empty slot');
    });
    expect(writes).toEqual([]);
  });
});
