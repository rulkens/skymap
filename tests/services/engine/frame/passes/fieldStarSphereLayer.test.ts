/**
 * fieldStarSphereLayer — unit tests for the close-range field-star sphere whose
 * PRESENCE is derived from PROXIMITY, not selection.
 *
 * The un-braid this suite pins: the layer draws a solar-radius sphere for the
 * nearest catalogued star the camera has descended into resolving range of —
 * with NO reference to `state.selectionRows`. Clicking the background (which
 * nulls both selection slots) must not blink the sphere out while the camera
 * still sits at solar-radius range. Selection only decorates (halo, InfoCard);
 * it never decides whether the body exists.
 *
 * A distance HYSTERESIS band guards the presence flag against threshold strobe
 * under camera jitter: a star turns ON once its sphere clears STAR_RESOLVE_PX
 * and stays ON until it recedes below 0.8×STAR_RESOLVE_PX. Between those
 * distances the answer depends on the stored state — present stays present,
 * absent stays absent — which the two-sub-case hysteresis test exercises.
 */

import { describe, it, expect, vi } from 'vitest';

import { fieldStarSphereLayer } from '../../../../../src/services/engine/frame/passes/fieldStarSphereLayer';
import { resolveStarRecord } from '../../../../../src/services/engine/helpers/resolveStarRecord';
import { buildStarOctree } from '../../../../../tools/stars/buildStarOctree';
import type { OctreeLeafStar, StarOctreeGrid } from '../../../../../tools/stars/buildStarOctree';
import {
  encodeStarCatalog,
  decodeStarCatalog,
} from '../../../../../src/data/starCatalog/starCatalogFormat';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import { SOLAR_RADIUS_KM } from '../../../../../src/data/bodies/solarRadiusKm';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { STAR_RESOLVE_PX } from '../../../../../src/services/engine/frame/partitionStarsByResolution';
import { unpackPick } from '../../../../../src/data/selectionEncoding';
import { makeSlab } from '../../../../fixtures/makeSlab';
import { Source } from '../../../../../src/data/sources';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const GRID: StarOctreeGrid = { mortonBitsPerAxis: 9, cellEdgePc: 1.0, gridOrigin: [0, 0, 0] };
const FOV = Math.PI / 3;
const VIEWPORT_H = 720;

/** Ascending-Morton sort — buildStarOctree's precondition. */
function sorted(stars: OctreeLeafStar[]): OctreeLeafStar[] {
  return [...stars].sort((a, b) => a.mortonIndex - b.mortonIndex);
}

/**
 * A single leaf cell holding three stars at distinct in-cell offsets, so the
 * middle one (record index 1) is an unambiguous nearest when the camera parks by
 * it — the neighbours (records 0 and 2, ~0.4 pc away) are far outside the
 * AU-scale resolve radius, so only record 1 is ever in range. Built through the
 * real octree + encode/decode path so the reconstruction matches the runtime.
 */
async function threeStarCatalog(): Promise<StarCatalog> {
  const stars: OctreeLeafStar[] = [
    { mortonIndex: 0, offset: [100, 100, 100], absMag: 5, bpRp: 0.3 },
    { mortonIndex: 0, offset: [500, 500, 500], absMag: 4, bpRp: 0.65 },
    { mortonIndex: 0, offset: [900, 900, 900], absMag: 3, bpRp: 0.9 },
  ];
  const octree = buildStarOctree(sorted(stars), GRID);
  return decodeStarCatalog(await encodeStarCatalog(octree));
}

/** Distance (Mpc) at which a solar-radius sphere subtends `px` — the gate inversion. */
function distForPx(px: number): number {
  const diameterKpc = (SOLAR_RADIUS_KM * 2 * SCALE_UNITS.KM_TO_MPC) / SCALE_UNITS.KPC_TO_MPC;
  const pxPerRad = VIEWPORT_H / (2 * Math.tan(FOV / 2));
  return (diameterKpc * pxPerRad) / (px * 1000);
}

const ON_MPC = distForPx(STAR_RESOLVE_PX); // sphere subtends exactly 4 px here
const OFF_MPC = distForPx(0.8 * STAR_RESOLVE_PX); // subtends 3.2 px — farther than ON

/** A camera `distMpc` along +x from a star position. */
function camAt(starPos: Readonly<Vec3>, distMpc: number): Vec3 {
  return [starPos[0] + distMpc, starPos[1], starPos[2]];
}

function makeCtx(camPos: Vec3): ReadyFrameContext {
  return {
    drawCamPos: camPos,
    fovYRad: FOV,
    canvasSize: { width: 1280, height: VIEWPORT_H },
    drawPxPerRad: VIEWPORT_H / (2 * Math.tan(FOV / 2)),
  } as unknown as ReadyFrameContext;
}

/**
 * Engine state exposing the three handles the layer touches: the catalog
 * renderer (`loadedCatalogs` — the presence-query seam), the sphere renderer
 * (`draw`), and the body pick renderer (`drawSphere`). NO `selectionRows` — the
 * layer must not read them.
 */
function stateWith(
  catalog: StarCatalog | null,
  overrides: Record<string, unknown> = {},
): EngineState {
  const starCatalogRenderer =
    catalog === null ? null : { loadedCatalogs: () => [{ source: Source.GaiaStars, catalog }] };
  return {
    gpu: {
      starCatalogRenderer,
      starRenderer: { draw: vi.fn() },
      bodyPickRenderer: { drawSphere: vi.fn() },
      ...overrides,
    },
  } as unknown as EngineState;
}

const PASS_STUB = {} as unknown as GPURenderPassEncoder;

/** A NEAR0 view whose f64 `slab.vp` differs from the f32 `vp` (the compose seam). */
function makeNear0View(camPos: Vec3): SlabView {
  const slab: Slab = makeSlab();
  return { slab, vp: new Float32Array(16), camPos, viewportPx: [1280, VIEWPORT_H] };
}

describe('fieldStarSphereLayer.enabled', () => {
  it('is present for a nearby star with NO selection at all — the core un-braid', async () => {
    const cat = await threeStarCatalog();
    const starPos = resolveStarRecord(cat, 1)!.positionMpc;
    // Camera well within the ON distance; state carries no selectionRows.
    expect(
      fieldStarSphereLayer.enabled(stateWith(cat), makeCtx(camAt(starPos, ON_MPC * 0.5))),
    ).toBe(true);
  });

  it('honours the hysteresis band: present stays present, absent stays absent', async () => {
    const bandDist = (ON_MPC + OFF_MPC) / 2; // between the ON and OFF thresholds

    // Sub-case A — was PRESENT (a prior close frame adopted the star): a band
    // frame keeps it. Fresh catalog so the WeakMap starts empty.
    const catA = await threeStarCatalog();
    const posA = resolveStarRecord(catA, 1)!.positionMpc;
    expect(fieldStarSphereLayer.enabled(stateWith(catA), makeCtx(camAt(posA, ON_MPC * 0.5)))).toBe(
      true,
    );
    expect(fieldStarSphereLayer.enabled(stateWith(catA), makeCtx(camAt(posA, bandDist)))).toBe(
      true,
    );

    // Sub-case B — was ABSENT (camera only ever saw the band): stays absent. A
    // separate catalog keeps its WeakMap entry independent of sub-case A.
    const catB = await threeStarCatalog();
    const posB = resolveStarRecord(catB, 1)!.positionMpc;
    expect(fieldStarSphereLayer.enabled(stateWith(catB), makeCtx(camAt(posB, bandDist)))).toBe(
      false,
    );
  });

  it('is absent (and clears its stored state) once the camera recedes past OFF', async () => {
    const cat = await threeStarCatalog();
    const starPos = resolveStarRecord(cat, 1)!.positionMpc;
    // Adopt it up close, then pull well past OFF — the star drops.
    expect(
      fieldStarSphereLayer.enabled(stateWith(cat), makeCtx(camAt(starPos, ON_MPC * 0.5))),
    ).toBe(true);
    expect(fieldStarSphereLayer.enabled(stateWith(cat), makeCtx(camAt(starPos, OFF_MPC * 4)))).toBe(
      false,
    );
    // Cleared, not merely hidden: back in the band it stays absent (the prior
    // presence did not survive the recede).
    const bandDist = (ON_MPC + OFF_MPC) / 2;
    expect(fieldStarSphereLayer.enabled(stateWith(cat), makeCtx(camAt(starPos, bandDist)))).toBe(
      false,
    );
  });

  it('is absent while the catalog is not loaded (pre-bootstrap)', () => {
    expect(fieldStarSphereLayer.enabled(stateWith(null), makeCtx([0, 0, 0]))).toBe(false);
  });
});

describe('fieldStarSphereLayer.draw', () => {
  it('draws the resolved present star (populated by enabled, read here)', async () => {
    const cat = await threeStarCatalog();
    const starPos = resolveStarRecord(cat, 1)!.positionMpc;
    const cam = camAt(starPos, ON_MPC * 0.5);
    const drawSpy = vi.fn();
    const state = stateWith(cat, { starRenderer: { draw: drawSpy } });

    // enabled runs first (the executor's contract) → stores the present star.
    expect(fieldStarSphereLayer.enabled(state, makeCtx(cam))).toBe(true);
    fieldStarSphereLayer.draw(PASS_STUB, makeNear0View(cam), makeCtx(cam), state);
    expect(drawSpy).toHaveBeenCalledTimes(1);
  });
});

describe('fieldStarSphereLayer.drawPick', () => {
  it('packs the PRESENT star’s Gaia record index — the id the point pick packs', async () => {
    const cat = await threeStarCatalog();
    const starPos = resolveStarRecord(cat, 1)!.positionMpc;
    const cam = camAt(starPos, ON_MPC * 0.5);

    let packedId = -1;
    const drawSphere = vi.fn((_pass: GPURenderPassEncoder, args: { packedId: number }) => {
      packedId = args.packedId;
    });
    const state = stateWith(cat, { bodyPickRenderer: { drawSphere } });

    expect(fieldStarSphereLayer.enabled(state, makeCtx(cam))).toBe(true);
    fieldStarSphereLayer.drawPick!(PASS_STUB, makeNear0View(cam), makeCtx(cam), state);

    expect(drawSphere).toHaveBeenCalledTimes(1);
    // The nearest resolvable record is the middle star, index 1.
    const decoded = unpackPick(packedId)!;
    expect(decoded.sourceCode).toBe(Source.GaiaStars);
    expect(decoded.localIdx).toBe(1);
  });
});
