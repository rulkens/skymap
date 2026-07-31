import { describe, it, expect, vi } from 'vitest';
import { SCENE_ANCHORS } from '../../../src/data/bodies/sceneAnchors';
import { SGR_A_STAR_ANCHOR } from '../../../src/data/bodies/sceneSgrAStar';
import { BODY_REGIONS } from '../../../src/data/bodies/bodyRegions';
import { regionById } from '../../../src/utils/scene/regionById';

describe('BODY_REGIONS', () => {
  it('solar-system and solar-neighbourhood share an anchor but not an extent', () => {
    // The distinction the whole plan rests on: anchor is a position, extent is a
    // scale. Collapsing the two rows — or deriving one extent for both — passes
    // every other assertion here and silently restores the single global
    // `FARTHEST_*` pair. Neptune's ~30 AU to Eta Carinae's ~2300 pc is seven
    // decades; the factor asserted is a decade short of that, so it fails on a
    // collapse without pinning today's roster.
    const solarSystem = regionById('solar-system');
    const neighbourhood = regionById('solar-neighbourhood');

    expect(solarSystem.anchorId).toBe(neighbourhood.anchorId);
    expect(neighbourhood.extentMpc).toBeGreaterThan(solarSystem.extentMpc * 1e6);
  });

  it('does not let a seeded anchor fall through to the residual region', () => {
    // Every anchor that resolves to a position is a member of SOME region it
    // anchors. The Sun satisfies it via `solar-system` while also anchoring the
    // neighbourhood, so the quantifier is over the regions an id anchors, not
    // over the one row being examined. Sgr A*'s seed is what makes this
    // discriminate against the real table: `solar-neighbourhood` is the RESIDUAL
    // region, claiming every anchor no tighter region took, so a fall-through
    // drags its extent 2.3e-3 → 8.178e-3 Mpc and `FOREGROUND_MAX_DISTANCE_MPC`
    // (extent × 100) 0.23 → 0.82 Mpc — past `MILKY_WAY_LABEL_NEAR_MPC` (0.6),
    // where the "You are here" label stops reaching full alpha in the Local
    // Group. That is a SECOND route to the same gate, distinct from the
    // `|anchorPos|` term prep-02 removed from `foregroundMaxDistance`; both have
    // to stay dead.
    for (const region of BODY_REGIONS) {
      const anchoredRegions = BODY_REGIONS.filter((r) => r.anchorId === region.anchorId);
      expect(anchoredRegions.some((r) => r.memberIds.includes(region.anchorId))).toBe(true);
    }

    // The consequence, pinned directly. A fallen-through Sgr A* would set the
    // residual extent to exactly its own distance from the Sun.
    const neighbourhood = regionById('solar-neighbourhood');
    expect(neighbourhood.memberIds).not.toContain('sgr-a-star');
    expect(neighbourhood.extentMpc).toBeLessThan(Math.hypot(...SGR_A_STAR_ANCHOR.positionMpc));
  });
});

/**
 * The empty-region case, driven by a synthetic table: `vi.doMock` + a dynamic
 * import in their own block, so the mocked anchors never reach the module cache
 * the tests above share.
 */
describe('BODY_REGIONS — a region whose anchor is not seeded', () => {
  it('has extent 0, not NaN, and never resolves the missing anchor', async () => {
    // `Math.max()` over an empty member list is −Infinity, and every edge that
    // scales off an extent would then read −Infinity too. `galactic-centre` no
    // longer supplies the case — Sgr A* is seeded, so the region correctly holds
    // its own anchor at extent 0 — so the empty region is made by taking that
    // anchor back out, which is also the state `bodyRegions.ts` is written to
    // tolerate (its anchor id is authored ahead of any seed). Emptiness must be
    // answered BEFORE the anchor is read, or the row resolves a position nothing
    // seeds and throws at import, taking the whole file with it.
    vi.resetModules();
    vi.doMock('../../../src/data/bodies/sceneAnchors', () => ({
      SCENE_ANCHORS: SCENE_ANCHORS.filter((anchor) => anchor.id !== 'sgr-a-star'),
    }));
    const { BODY_REGIONS: unseeded } = await import('../../../src/data/bodies/bodyRegions');
    const galacticCentre = unseeded.find((region) => region.id === 'galactic-centre')!;

    expect(galacticCentre.memberIds).toEqual([]);
    expect(galacticCentre.extentMpc).toBe(0);

    vi.doUnmock('../../../src/data/bodies/sceneAnchors');
    vi.resetModules();
  });
});
