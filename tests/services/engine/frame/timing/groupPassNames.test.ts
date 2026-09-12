/**
 * groupPassNames — projecting the DebugPanel toggles' live PLAIN pass names
 * into the same display groups the timing list uses.
 */

import { describe, it, expect } from 'vitest';

import { groupPassNames } from '../../../../../src/services/engine/frame/timing/groupPassNames';

describe('groupPassNames', () => {
  it('groups an arbitrary togglable-name list by pass group, in title order, omitting empty groups', () => {
    // 'earth' is drawn only on body rows: the engine handle's `allNames` passes
    // its PLAIN name (one entry regardless of body-row count), which must still
    // resolve to 'Foreground bodies · depth' even though `passTimingSlotName`
    // suffixes its TIMED_SLOTS row — `PASS_GROUP_KEYS` is built from the
    // separate `plainPassGroupKeys` walk for exactly this.
    const groups = groupPassNames(['labels', 'point-sprites', 'earth', 'star-aggregates']);
    expect(groups.map((g) => g.title)).toEqual([
      'Volumes & aggregates', // star-aggregates
      'Cosmos · HDR', // point-sprites
      'Foreground bodies · depth', // earth
      'Overlays', // labels
    ]);
    // No composite/pick names supplied (they aren't togglable), so that group
    // never appears in the toggles projection.
    expect(groups.some((g) => g.title === 'Composites & pick')).toBe(false);
  });

  it('puts an unknown pass name in a fallback group titled with the name itself', () => {
    expect(groupPassNames(['textured-quads'])).toEqual([
      { title: 'textured-quads', rows: [{ name: 'textured-quads', groupKey: 'textured-quads' }] },
    ]);
  });
});
