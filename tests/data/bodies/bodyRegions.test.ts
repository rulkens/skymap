import { describe, it, expect, vi } from 'vitest';
import { SCENE_ANCHORS } from '../../../src/data/bodies/sceneAnchors';
import { regionById } from '../../../src/utils/scene/regionById';
import type { AnchorBody } from '../../../src/@types/scene/AnchorBody';

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

  it('an empty region has extent 0, not NaN', () => {
    // `Math.max()` over an empty member list is −Infinity, and every edge that
    // scales off an extent would then read −Infinity too. Sgr A* is not seeded
    // until the feature plan, so this row must also reach 0 WITHOUT resolving
    // its anchor — which it fails by throwing at import, taking the file with it.
    const galacticCentre = regionById('galactic-centre');

    expect(galacticCentre.memberIds).toEqual([]);
    expect(galacticCentre.extentMpc).toBe(0);
  });
});

/**
 * The anchor-membership rule, driven by a synthetic anchor: `vi.doMock` + a
 * dynamic import in their own block, so the mocked table never reaches the
 * module cache the tests above share.
 */
describe('BODY_REGIONS — an anchor sits in a region it anchors', () => {
  it('does not let a newly seeded anchor fall through to the residual region', async () => {
    // Against the real table this rule is vacuous for `sgr-a-star` — the id is
    // authored in `bodyRegions.ts` ahead of the feature plan's seed — so the
    // synthetic anchor is what makes the test discriminate NOW instead of once
    // the plan lands. What it guards: `solar-neighbourhood` is the RESIDUAL
    // region, claiming every anchor no tighter region took, so an anchor falling
    // through drags its extent 2.3e-3 → 8.178e-3 Mpc and
    // `FOREGROUND_MAX_DISTANCE_MPC` (extent × 100) 0.23 → 0.82 Mpc — past
    // `MILKY_WAY_LABEL_NEAR_MPC` (0.6 Mpc), where the "You are here" label stops
    // reaching full alpha in the Local Group. That is a SECOND route to the same
    // gate, distinct from the `|anchorPos|` term prep-02 removed from
    // `foregroundMaxDistance`; both have to stay dead.
    const sgrAStar: AnchorBody = { id: 'sgr-a-star', positionMpc: [8.178e-3, 0, 0] };

    vi.resetModules();
    vi.doMock('../../../src/data/bodies/sceneAnchors', () => ({
      SCENE_ANCHORS: [...SCENE_ANCHORS, sgrAStar],
    }));
    const { BODY_REGIONS: seeded } = await import('../../../src/data/bodies/bodyRegions');

    // Every anchor that resolves to a position is a member of SOME region it
    // anchors. The Sun satisfies it via `solar-system` while also anchoring the
    // neighbourhood, so the quantifier is over the regions an id anchors, not
    // over the one row being examined.
    for (const region of seeded) {
      const anchoredRegions = seeded.filter((r) => r.anchorId === region.anchorId);
      expect(anchoredRegions.some((r) => r.memberIds.includes(region.anchorId))).toBe(true);
    }

    // The consequence, pinned directly: the residual's extent — and so the far
    // plane derived from it — is unmoved by the new anchor.
    const neighbourhood = seeded.find((r) => r.id === 'solar-neighbourhood')!;
    expect(neighbourhood.extentMpc).toBe(regionById('solar-neighbourhood').extentMpc);

    vi.doUnmock('../../../src/data/bodies/sceneAnchors');
    vi.resetModules();
  });
});
