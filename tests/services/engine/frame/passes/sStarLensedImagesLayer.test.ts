/**
 * The S-star handoff at the Sgr A* lens band: `starPointsLayer` owns the
 * S-stars outside it, `sStarLensedImagesLayer` owns them inside it, and never
 * both.
 *
 * The two rows share one roster and one renderer TYPE, so the failure this
 * suite exists to catch is double-drawing (a star at its un-deflected anchor
 * under the lens's OVER blend AND as an image over it) or silent loss — neither
 * of which any type or other test would notice.
 */

import { describe, it, expect, vi } from 'vitest';

import { starPointsLayer } from '../../../../../src/services/engine/frame/passes/starPointsLayer';
import { sStarLensedImagesLayer } from '../../../../../src/services/engine/frame/passes/sStarLensedImagesLayer';
import { S_STAR_IDS } from '../../../../../src/services/engine/frame/sStarLensedImages';
import { sgrAStarLensBandAlpha } from '../../../../../src/services/engine/frame/sgrAStarLensBandAlpha';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { SCENE_STARS } from '../../../../../src/data/bodies/sceneStars';
import { SCENE_S_STARS } from '../../../../../src/data/bodies/sceneSStars';
import { SGR_A_STAR } from '../../../../../src/data/bodies/sceneSgrAStar';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { makeBodyItems } from '../../../../fixtures/makeBodyItems';
import { makeSlab } from '../../../../fixtures/makeSlab';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { PositionedStar } from '../../../../../src/@types/scene/PositionedStar';
import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const SGR_A_STAR_POS = deriveBodyStates(CONST_J2000).get(SGR_A_STAR.id)!.positionMpc;

/** A camera `au` astronomical units off Sgr A* along +x — the band's own axis of tuning. */
const camAtAu = (au: number): Vec3 => [
  SGR_A_STAR_POS[0] + au * SCALE_UNITS.AU_TO_MPC,
  SGR_A_STAR_POS[1],
  SGR_A_STAR_POS[2],
];

// Inside the band (fullAt 100 AU, goneAt 500 AU) and well outside it. Both are
// deep inside FOREGROUND_MAX_DISTANCE_MPC and the starBackdrop band, so
// star-points is live either way and the S-star membership is the only variable.
const IN_BAND_CAM = camAtAu(300);
const OUT_OF_BAND_CAM = camAtAu(5000);

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

function makeCtx(camPos: Readonly<Vec3>): ReadyFrameContext {
  return {
    cam: { distance: 300 * SCALE_UNITS.AU_TO_MPC },
    drawCamPos: camPos,
    fovYRad: Math.PI / 3,
    canvasSize: { width: 1280, height: 720 },
    simDays: CONST_J2000,
    viewSlot: 0,
  } as unknown as ReadyFrameContext;
}

function makeView(camPos: Vec3): SlabView {
  return { slab: makeSlab(), vp: new Float32Array(16), camPos, viewportPx: [1280, 720] };
}

function makeRenderer() {
  return {
    setStars: vi.fn<(stars: readonly PositionedStar[], viewSlot: number) => void>(),
    draw: vi.fn<
      (
        pass: GPURenderPassEncoder,
        viewProj: Float32Array,
        viewportPx: Vec2,
        opts: { sizePx: number; brightness: number; viewSlot: number },
      ) => void
    >(),
  };
}

function makeState(starPointRenderer: unknown, sStarLensedImageRenderer: unknown): EngineState {
  return {
    gpu: { starPointRenderer, sStarLensedImageRenderer },
    data: { bodies: { stars: [...SCENE_STARS, ...SCENE_S_STARS] } },
    settings: {
      starCatalogs: {
        enabled: true,
        items: { famousStar: { enabled: true } },
        sizePx: 3.25,
        brightness: 0.8,
        exposureNearX: 15,
        exposureMidX: 57,
        exposureFarX: 70,
      },
      bodies: { items: makeBodyItems() },
    },
  } as unknown as EngineState;
}

/** The ids `starPointsLayer` actually uploads at `camPos`. */
function starPointIds(state: EngineState, renderer: ReturnType<typeof makeRenderer>, camPos: Vec3) {
  starPointsLayer.draw(PASS_STUB, makeView(camPos), makeCtx(camPos), state);
  return renderer.setStars.mock.calls.at(-1)![0].map((star) => star.id);
}

describe('the S-star / lensed-image handoff', () => {
  it('outside the band star-points owns the S-stars and the image row is off', () => {
    expect(sgrAStarLensBandAlpha(makeState(null, null), makeCtx(OUT_OF_BAND_CAM))).toBe(0);

    const points = makeRenderer();
    const state = makeState(points, makeRenderer());
    const ids = starPointIds(state, points, OUT_OF_BAND_CAM);
    expect(ids.filter((id) => S_STAR_IDS.has(id))).toEqual(SCENE_S_STARS.map((star) => star.id));

    expect(
      sStarLensedImagesLayer.enabled(state, makeCtx(OUT_OF_BAND_CAM), makeView(OUT_OF_BAND_CAM)),
    ).toBe(false);
  });

  it('inside the band star-points drops every S-star and the image row takes them over', () => {
    const ctx = makeCtx(IN_BAND_CAM);
    const view = makeView(IN_BAND_CAM);
    expect(sgrAStarLensBandAlpha(makeState(null, null), ctx)).toBeGreaterThan(0);

    const points = makeRenderer();
    const images = makeRenderer();
    const state = makeState(points, images);

    // No S-star may reach the pre-lens row — its OVER blend would bury the
    // anchor copy anyway, and the image copy above it would read as a double.
    const ids = starPointIds(state, points, IN_BAND_CAM);
    expect(ids.filter((id) => S_STAR_IDS.has(id))).toEqual([]);
    // The famous stars are untouched: only the S-stars change hands.
    expect(ids).toContain('sun');

    expect(sStarLensedImagesLayer.enabled(state, ctx, view)).toBe(true);
    sStarLensedImagesLayer.draw(PASS_STUB, view, ctx, state);
    const uploaded = images.setStars.mock.calls[0]![0];

    // One or two images per S-star: the primary always survives, the secondary
    // only where the star sits near enough to the axis to clear the shadow and
    // the brightness floor.
    const sStarCount = SCENE_S_STARS.length;
    const uploadedIds = new Set(uploaded.map((image) => image.id));
    expect(uploadedIds).toEqual(S_STAR_IDS);
    expect(uploaded.length).toBeGreaterThanOrEqual(sStarCount);
    expect(uploaded.length).toBeLessThanOrEqual(2 * sStarCount);

    // Deflected, not moved: each image keeps its star's RANGE from the eye, so
    // the renderer's inverse-square dimming is untouched. Positions come back
    // camera-relative, so the range is the vector's own length.
    const states = deriveBodyStates(CONST_J2000);
    for (const image of uploaded) {
      const anchor = states.get(image.id)!.positionMpc;
      const rangeMpc = Math.hypot(
        anchor[0] - IN_BAND_CAM[0],
        anchor[1] - IN_BAND_CAM[1],
        anchor[2] - IN_BAND_CAM[2],
      );
      expect(Math.hypot(...image.positionMpc) / rangeMpc).toBeCloseTo(1, 9);
    }

    // The brightest image of a star is never fainter than the star itself: the
    // primary magnification is >= 1, so its Δm = −2.5 log10 μ can only brighten.
    for (const star of SCENE_S_STARS) {
      const mags = uploaded.filter((image) => image.id === star.id).map((i) => i.absMag);
      expect(Math.min(...mags)).toBeLessThanOrEqual(star.absMag);
    }
  });

  it('is a no-op when its renderer handle is null (pre-bootstrap)', () => {
    const state = makeState(makeRenderer(), null);
    const ctx = makeCtx(IN_BAND_CAM);
    expect(sStarLensedImagesLayer.enabled(state, ctx, makeView(IN_BAND_CAM))).toBe(false);
    expect(() =>
      sStarLensedImagesLayer.draw(PASS_STUB, makeView(IN_BAND_CAM), ctx, state),
    ).not.toThrow();
  });
});
