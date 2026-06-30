/**
 * famousFlythrough tests — the curated "grand tour" clip: one `flyPath` that
 * sweeps THROUGH iconic famous galaxies, ordered as an outward journey from the
 * Local Group (Andromeda) to the Virgo cluster (M87).
 *
 * The flyPath primitive's resolve→compile→evaluate pipeline is already proven
 * end-to-end by `flyPathDemo.test.ts` (with a structure fixture). What's unique
 * here is the DATA: the curated set of famous-galaxy ids, their order, the live
 * start, and the single-spline shape. So these tests assert that shape directly
 * — no catalog cloud fixture needed, because we are checking the authored clip,
 * not re-testing the machinery.
 *
 * Each waypoint must address a BARE famous-galaxy seed id (e.g. `m31`, `c77`),
 * not a `group-`/`cluster-`/`pgc-` prefixed id — those route to other resolver
 * arms in `resolveFocusId`. The "no dash" check encodes that: famous seed ids
 * carry no dash, every other focus-id form does.
 */

import { describe, it, expect } from 'vitest';
import { famousFlythrough } from '../../../../src/data/animation/clips/famousFlythrough';

/**
 * The curated set in its turn-minimised order (open-TSP over real 3D positions,
 * not by distance — see the clip's module docstring). Settles on M87.
 */
const EXPECTED_WAYPOINTS = [
  'c65', // Sculptor
  'm31', // Andromeda
  'm101', // Pinwheel
  'm51', // Whirlpool
  'm104', // Sombrero
  'm83', // Southern Pinwheel
  'c77', // Centaurus A
  'm33', // Triangulum
  'm81', // Bode's
  'm64', // Black Eye
  'm87', // Virgo A (finale)
];

describe('famousFlythrough clip', () => {
  it('is a single flyPath that launches from the live camera pose', () => {
    expect(famousFlythrough.id).toBe('famousFlythrough');
    expect(famousFlythrough.label.length).toBeGreaterThan(0);
    expect(famousFlythrough.data.start).toBe('live');
    expect(famousFlythrough.data.timeline).toHaveLength(1);

    const fly = famousFlythrough.data.timeline[0]!;
    expect(fly.kind).toBe('flyPath');
    if (fly.kind !== 'flyPath') throw new Error('expected a flyPath effect');
    expect(fly.over).toBeGreaterThan(0);
  });

  it('visits the curated famous galaxies as catalog-resolved waypoints, in order', () => {
    const fly = famousFlythrough.data.timeline[0]!;
    if (fly.kind !== 'flyPath') throw new Error('expected a flyPath effect');

    const ids = fly.waypoints.map((w) => {
      if (!('id' in w)) throw new Error('every waypoint must be an atFocus (id) form');
      return String(w.id);
    });

    expect(ids).toEqual(EXPECTED_WAYPOINTS);
  });

  it('addresses bare famous-galaxy seed ids (no structure/pgc/sdss prefix)', () => {
    const fly = famousFlythrough.data.timeline[0]!;
    if (fly.kind !== 'flyPath') throw new Error('expected a flyPath effect');

    for (const w of fly.waypoints) {
      if (!('id' in w)) throw new Error('every waypoint must be an atFocus (id) form');
      // Famous seed ids carry no dash; every other focus-id form (group-, pgc-,
      // sdss-, pos@) does. A dash here would route to the wrong resolver arm.
      expect(String(w.id)).toMatch(/^[a-z0-9]+$/);
    }
  });
});
