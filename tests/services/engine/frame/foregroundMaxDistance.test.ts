/**
 * foregroundMaxDistance — pins the shared NEAR0 foreground gate's two
 * load-bearing properties, both of which live in OTHER modules:
 *
 *   1. It stays far below galaxy scale (< 1 Mpc), pinning it as a NEAR-FIELD
 *      gate: at galaxy / cosmic zoom every NEAR0 foreground pass must read
 *      idle, which is the whole point of the gate.
 *   2. It stays inside the Milky-Way label's near band, so `surveyDeepZoom` —
 *      whose FULL edge this gate IS — reads full before the label's own fade.
 *
 * The gate is a SCALE (the widest region extent × margin), never a distance
 * from the origin, so the third case guards the derivation that would break
 * both properties the moment a region is anchored at the Galactic Centre.
 */

import { describe, it, expect, vi } from 'vitest';

import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/foregroundMaxDistance';
import { MILKY_WAY_LABEL_NEAR_MPC } from '../../../../src/services/gpu/labelLayout/milkyWayLabelVisibility';
import { BODY_REGIONS } from '../../../../src/data/bodies/bodyRegions';

describe('FOREGROUND_MAX_DISTANCE_MPC', () => {
  it('stays far below galaxy scale', () => {
    // A near-field gate: at galaxy scale (>= 1 Mpc) every NEAR0 foreground
    // layer must be off.
    expect(FOREGROUND_MAX_DISTANCE_MPC).toBeLessThan(1);
  });

  it("the far plane stays below the Milky-Way label's near band", () => {
    // The gate is `SCALE_FADE_BANDS.surveyDeepZoom`'s FULL edge, so it has to
    // land inside the "You are here" label's near band or the band stops
    // reading full before the label's own distance fade does — and the
    // origin-anchored annotation never returns to full alpha in the Local
    // Group. A widened margin, or an extent that swallowed a far anchor, both
    // surface here.
    expect(FOREGROUND_MAX_DISTANCE_MPC).toBeLessThan(MILKY_WAY_LABEL_NEAR_MPC);
  });

  it("the far plane is unchanged by a distant region's anchor", async () => {
    // The gate maxes over region EXTENTS alone. An earlier derivation added the
    // anchor's own distance from the origin, mixing a position into a threshold
    // that is compared against `ctx.cam.distance` — a camera-to-TARGET distance
    // — so a region parked far away widened the gate for content whose own
    // scale is tiny. Sgr A* is not seeded yet, so the synthetic region borrows a
    // seeded far anchor (Eta Carinae, the roster's own 2.3 kpc edge) with an
    // extent well under the neighbourhood's: `|anchor| + extent` would land the
    // gate at 0.24 Mpc where the extent alone leaves it at 0.23.
    const farAnchoredRegion = {
      id: 'galactic-centre' as const,
      label: 'Galactic Centre',
      anchorId: 'eta-carinae',
      memberIds: ['eta-carinae'],
      extentMpc: 1e-4,
    };

    vi.resetModules();
    vi.doMock('../../../../src/data/bodies/bodyRegions', () => ({
      BODY_REGIONS: [
        ...BODY_REGIONS.filter((region) => region.id !== 'galactic-centre'),
        farAnchoredRegion,
      ],
    }));
    const { FOREGROUND_MAX_DISTANCE_MPC: seeded } =
      await import('../../../../src/services/engine/frame/foregroundMaxDistance');

    expect(seeded).toBe(FOREGROUND_MAX_DISTANCE_MPC);

    vi.doUnmock('../../../../src/data/bodies/bodyRegions');
    vi.resetModules();
  });
});
