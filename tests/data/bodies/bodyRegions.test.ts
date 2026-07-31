import { describe, it, expect, vi } from 'vitest';
import { SCENE_ANCHORS } from '../../../src/data/bodies/sceneAnchors';
import { SGR_A_STAR_ANCHOR } from '../../../src/data/bodies/sceneSgrAStar';
import { BODY_REGIONS } from '../../../src/data/bodies/bodyRegions';
import { elementsById } from '../../../src/data/bodies/orbitalElements';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { regionById } from '../../../src/utils/scene/regionById';
import { regionRelativeDistanceMpc } from '../../../src/utils/scene/regionRelativeDistanceMpc';
import type { Vec3 } from '../../../src/@types/math/Vec3';

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

  it('the galactic-centre region extent covers the widest S-star orbit, not S2', () => {
    // The far S-stars are what set this regime's scale. S85 is the widest orbit
    // in Gillessen's table (a = 4.6″, e = 0.78 ⇒ apoapsis 0.325 pc = 3.25e-7 Mpc)
    // and S2 — the star every reader reaches for — is ~35× tighter at 1934 AU.
    // Sizing the region on S2 is the failure this pins, and it fails here by an
    // order of magnitude rather than a hair.
    //
    // The floor is deliberately well under that 35×: `extentMpc` is the max
    // member distance in the J2000 SNAPSHOT, not an apoapsis envelope, so the
    // stars are wherever their phase puts them at the epoch and the figure lands
    // at ~12× S2's apoapsis (R34, near its own apoapsis, sets it) rather than 35×.
    // A derivation that switched to the apoapsis envelope would only raise it.
    const galacticCentre = regionById('galactic-centre');
    const s2 = elementsById('s2');
    const s2ApoapsisMpc = s2.semiMajorMpc * (1 + s2.eccentricity);

    expect(galacticCentre.memberIds).toContain('s85');
    expect(galacticCentre.extentMpc).toBeGreaterThan(s2ApoapsisMpc * 10);
  });

  it('a Galactic-Centre camera keys the region at parsec scale, not 8 kpc', () => {
    // What the populated region buys the near-field bands: a camera one parsec
    // off Sgr A* reads one parsec, not the 8.178 kpc `hypot(camPos)` gives — the
    // render origin is the Sun, so an origin-keyed band would read this camera as
    // deep-field and switch every galactic-centre-scoped layer off.
    const states = deriveBodyStates(CONST_J2000);
    const galacticCentre = regionById('galactic-centre');
    const anchorPos = states.get(galacticCentre.anchorId)!.positionMpc;
    const ONE_PARSEC_MPC = 1e-6;
    const camPos: Vec3 = [anchorPos[0] + ONE_PARSEC_MPC, anchorPos[1], anchorPos[2]];

    expect(regionRelativeDistanceMpc(camPos, galacticCentre, states)).toBeCloseTo(
      ONE_PARSEC_MPC,
      12,
    );
    expect(regionRelativeDistanceMpc(camPos, galacticCentre, states)).toBeLessThan(
      Math.hypot(...camPos) / 1000,
    );
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
    //
    // "Ahead of the seed" means ahead of BOTH halves of it: with the anchor gone
    // but the 39 S-star rows still focused on it, `focusResolveOrder` throws on
    // the dangling focus before any region is built, so the element table is
    // mocked in step with the anchor table.
    vi.resetModules();
    vi.doMock('../../../src/data/bodies/sceneAnchors', () => ({
      SCENE_ANCHORS: SCENE_ANCHORS.filter((anchor) => anchor.id !== 'sgr-a-star'),
    }));
    vi.doMock('../../../src/data/bodies/orbitalElements', async () => {
      const actual = await vi.importActual<
        typeof import('../../../src/data/bodies/orbitalElements')
      >('../../../src/data/bodies/orbitalElements');
      return {
        ...actual,
        ORBITAL_ELEMENTS: actual.ORBITAL_ELEMENTS.filter((el) => el.focusId !== 'sgr-a-star'),
      };
    });
    const { BODY_REGIONS: unseeded } = await import('../../../src/data/bodies/bodyRegions');
    const galacticCentre = unseeded.find((region) => region.id === 'galactic-centre')!;

    expect(galacticCentre.memberIds).toEqual([]);
    expect(galacticCentre.extentMpc).toBe(0);

    vi.doUnmock('../../../src/data/bodies/sceneAnchors');
    vi.doUnmock('../../../src/data/bodies/orbitalElements');
    vi.resetModules();
  });
});
