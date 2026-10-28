/**
 * bodyRowSlabs — which slab rows a `BodyRowSource` line expands over: a row's
 * `hosts` entry, open while this view's eye is inside its band.
 *
 * The out-of-band case is the load-bearing one: an empty list is what lets
 * `mergeAdjacent` fold the two `(hdr, NEAR0)` lines back into a single render
 * step, so the assertion runs the real expansion rather than stopping at `[]`.
 *
 * The candidate list is folded the way `deriveFrameContext` folds it, so the
 * band edges the lens is born at stay pinned through the composition of
 * `slabRowActive` and this resolver, not just inside either one.
 */

import { describe, it, expect } from 'vitest';

import { bodyRowSlabs } from '../../../../src/services/engine/frame/bodyRowSlabs';
import { expandFrameOrder } from '../../../../src/services/engine/frame/expandFrameOrder';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { bodyLayer } from '../../../../src/layers/body/layer';
import type { BodyRuntime } from '../../../../src/layers/body/@types/BodyRuntime';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { starSpheresPass } from '../../../../src/layers/starCatalog/passes/starSpheresPass';
import { fieldStarSpherePass } from '../../../../src/layers/starCatalog/passes/fieldStarSpherePass';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';
import { GALACTIC_CENTRE_ANCHOR } from '../../../../src/data/places/galacticCentre';
import { blackHoleSlabRow } from '../../../../src/layers/blackHoles/present/blackHoleSlabRow';
import { BLACK_HOLES } from '../../../../src/layers/blackHoles/data/blackHoles';
import { slabRowActive } from '../../../../src/utils/frame/slabRowActive';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { atmosphereDrawList } from '../../../../src/layers/body/present/atmosphereDrawList';
import { BODY_SLAB_ROWS } from '../../../../src/layers/body/present/bodySlabRows';
import { atmosphereInsideBand } from '../../../../src/layers/body/present/atmosphereInsideBand';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { IDENTITY_MAT3 } from '../../../../src/utils/math/identityMat3';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { StarCatalogRuntime } from '../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { ToneMap } from '../../../../src/@types/rendering/ToneMap';

const SIM_DAYS = 0;
const LENS_SLAB_INDEX = 4;

/** The real anchor position, so the band is exercised at its authored edges. */
function camAtAuFromGalacticCentre(au: number): Vec3 {
  const anchor = deriveBodyStates(SIM_DAYS).get(GALACTIC_CENTRE_ANCHOR.id);
  if (anchor === undefined) throw new Error('deriveBodyStates carries no galactic-centre row');
  const [x, y, z] = anchor.positionMpc;
  return [x + au * SCALE_UNITS.AU_TO_MPC, y, z];
}

/** The lens rows folded the way `deriveFrameContext` folds them; no body pose,
 *  which a row hosting a line with no band never reads. */
function makeCtx(camPos: Vec3, slabs: readonly Slab[]): FrameView {
  return {
    snapshot: {
      simDays: SIM_DAYS,
      slabBodyCandidates: BLACK_HOLES.map(blackHoleSlabRow).filter((row) =>
        slabRowActive(row, camPos, deriveBodyStates(SIM_DAYS)),
      ),
    },
    slabs,
    bodyPose: () => null,
  } as unknown as FrameView;
}

const EARTH_SLAB_INDEX = 2;
const EARTH_SLAB = makeSlab({
  index: EARTH_SLAB_INDEX,
  frame: { kind: 'body-m', hostId: SCENE_EARTH.id },
});
const EARTH_INSIDE_EDGE_MPC = atmosphereInsideBand(SCENE_EARTH.id)!.goneAt;
const EARTH_STATE = {} as unknown as PassState;

/** This view's eye `rMpc` from Earth's centre, Earth's own row in the slab table;
 *  `drawCamPos` and `cam.distance` keep Earth past the draw list's culls. */
function earthCtxAt(rMpc: number): FrameView {
  const [x, y, z] = deriveBodyStates(SIM_DAYS).get(SCENE_EARTH.id)!.positionMpc;
  return {
    snapshot: { simDays: SIM_DAYS, slabBodyCandidates: BODY_SLAB_ROWS },
    slabs: [makeSlab(), EARTH_SLAB],
    bodyPose: (id: string) =>
      id === SCENE_EARTH.id
        ? { eyeRelBodyM: [rMpc * SCALE_UNITS.MPC_TO_M, 0, 0], basisM: [...IDENTITY_MAT3] as Mat3 }
        : null,
    drawCamPos: [x + rMpc, y, z],
    cam: { distance: 0 },
    drawPxPerRad: 1000,
  } as unknown as FrameView;
}

const LENS_SLAB = makeSlab({
  index: LENS_SLAB_INDEX,
  frame: { kind: 'body-m', hostId: GALACTIC_CENTRE_ANCHOR.id },
});

describe('bodyRowSlabs', () => {
  it('lens rows host the lens line with no band', () => {
    const ctx = makeCtx(camAtAuFromGalacticCentre(120), [makeSlab(), LENS_SLAB]);

    expect(bodyRowSlabs(ctx).lens).toEqual([LENS_SLAB_INDEX]);
  });

  it('resolves nothing outside the band, so the two hdr·NEAR0 lines still merge', () => {
    const ctx = makeCtx(camAtAuFromGalacticCentre(900), [makeSlab(), LENS_SLAB]);

    const slabs = bodyRowSlabs(ctx);
    expect(slabs.lens).toEqual([]);

    const tone: ToneMap = { exposure: 1.5, curve: 4, hdrKnee: 0, hdrHeadroom: 0 };
    // The starCatalog and body Layers' rows join core's in the real program
    // (`createLayers`) — folded in here too, or the `foreground:0` step this
    // test locates via its name comes back empty and drops.
    const starRuntime = {} as StarCatalogRuntime;
    const passes = [
      ...CONTENT_PASSES,
      ...bodyLayer.passes({} as BodyRuntime),
      starSpheresPass(starRuntime),
      fieldStarSpherePass(starRuntime),
    ];
    const program = expandFrameOrder(FRAME_ORDER, passes, {
      tone,
      bloomEnabled: true,
      foregroundChain: [NEAR0],
      captureFaces: new Map([['sgrAStar', []]]),
      bodyRowSlabs: slabs,
    });
    const foregroundAt = program.findIndex(
      (step) => step.kind === 'render' && step.target === 'foreground:0',
    );
    const hdrNear0 = program
      .slice(0, foregroundAt)
      .filter((step) => step.kind === 'render' && step.target === 'hdr' && step.slab === NEAR0);

    expect(hdrNear0).toHaveLength(1);
  });

  it('resolves nothing when the row is active but its slab missed this frame', () => {
    const ctx = makeCtx(camAtAuFromGalacticCentre(120), [makeSlab()]);

    expect(bodyRowSlabs(ctx).lens).toEqual([]);
  });

  it("the aerial line lands on the row whose band holds this view's eye", () => {
    expect(bodyRowSlabs(earthCtxAt(0.99 * EARTH_INSIDE_EDGE_MPC)).insideAtmosphere).toEqual([
      EARTH_SLAB_INDEX,
    ]);
    expect(bodyRowSlabs(earthCtxAt(1.01 * EARTH_INSIDE_EDGE_MPC)).insideAtmosphere).toEqual([]);
  });

  it('the shell and the aerial line agree on inside at every radius', () => {
    // Disagreement draws the limb twice (both paths) or leaves a black sky (neither).
    const shellInside = [0.5, 1 - 1e-10, 1, 1 + 1e-10, 2].map((k) => {
      const ctx = earthCtxAt(k * EARTH_INSIDE_EDGE_MPC);
      const inside = atmosphereDrawList(EARTH_STATE, ctx).find(
        (entry) => entry.body.id === SCENE_EARTH.id,
      )!.inside;
      expect(bodyRowSlabs(ctx).insideAtmosphere.includes(EARTH_SLAB_INDEX)).toBe(inside);
      return inside;
    });
    // Both answers occur, so the agreement is not two rules stuck on one value.
    expect(shellInside[0]).toBe(true);
    expect(shellInside[4]).toBe(false);
  });
});
