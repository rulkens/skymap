/**
 * focusedFieldStarSphereLayer — unit tests for the close-range sphere gate of
 * a FOCUSED Gaia field star (spec Amendment 2026-07-17, Stage 1.5).
 *
 * The load-bearing gate subtlety this suite pins is the distance SOURCE: the
 * layer must gate on the CAMERA-TO-STAR distance
 * (`|row.positionMpc − ctx.drawCamPos|`), NOT `ctx.cam.distance` (the orbit
 * distance from the render origin). A field star sits parsecs from the Sun, so
 * the origin distance is irrelevant — only the star's own apparent sphere size
 * decides whether the descent has reached resolving range. We prove it by
 * placing the star parsecs from the origin and moving ONLY the camera: the same
 * row enables when the camera is half an AU off the star and disables when the
 * camera is a kpc away, even though `ctx.cam.distance` is identical in both
 * (the fixtures keep the camera the same distance from the origin — see the
 * fixtures below). A non-`star` row (or none) and a null renderer disable
 * regardless, mirroring `near0SelectionRingLayer` / `starSpheresLayer`.
 */

import { describe, it, expect, vi } from 'vitest';

import { focusedFieldStarSphereLayer } from '../../../../../src/services/engine/frame/passes/focusedFieldStarSphereLayer';
import { SOLAR_RADIUS_KM } from '../../../../../src/data/bodies/solarRadiusKm';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import { unpackPick } from '../../../../../src/data/selectionEncoding';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { SelectionRow } from '../../../../../src/@types/engine/SelectionRow';
import type { GalaxyRow } from '../../../../../src/@types/engine/GalaxyRow';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { Source } from '../../../../../src/data/sources';

// A picked field star parsecs from the render origin (its true habitat). Its
// physical size is the nominal solar radius the extractor stamps (Task 8b).
const STAR_POS: Vec3 = [0.4, -0.3, 0.5]; // ~0.7 Mpc from origin — far from the Sun
const STAR_ROW: SelectionRow = {
  type: 'star',
  index: 7,
  positionMpc: STAR_POS,
  absMag: 4.8,
  bpRp: 0.65,
  radiusKm: SOLAR_RADIUS_KM,
};

// A galaxy row — a non-`star` arm; the sphere layer must ignore it.
const GALAXY_ROW: SelectionRow = {
  type: 'galaxyCatalog',
  source: Source.Glade,
  index: 0,
  objId: '1',
  x: 0,
  y: 0,
  z: 100,
  redshift: 0,
  magU: 0,
  magG: 0,
  magR: 0,
  magI: 0,
  magZ: 0,
  diameterKpc: 60,
  axisRatio: 1,
  positionAngleDeg: 0,
  classByte: 0,
  parentSurveyByte: 0,
} as GalaxyRow;

/**
 * A ctx exposing exactly the gate's reads: the absolute camera position
 * (`drawCamPos`, from which camera-to-star distance is measured), the vertical
 * fov, and the viewport height. 60° fov + 720-px viewport matches the sibling
 * fixtures. `cam.distance` is set to a FIXED sentinel across both the close and
 * far cases so a gate that (wrongly) read it could not tell them apart — only
 * the camera-to-star distance separates them.
 */
function makeCtx(camPos: Vec3): ReadyFrameContext {
  return {
    cam: { distance: 999 },
    drawCamPos: camPos,
    fovYRad: Math.PI / 3,
    canvasSize: { width: 1280, height: 720 },
    // Pinhole radian→pixel conversion the drawPick radius floor reads
    // (`minPickRadiusMpc`): 720 / (2·tan(30°)).
    drawPxPerRad: 720 / (2 * Math.tan(Math.PI / 6)),
  } as unknown as ReadyFrameContext;
}

/** A camera half an AU from a position — a solar sphere there clears STAR_RESOLVE_PX. */
function halfAuFrom(positionMpc: Vec3): Vec3 {
  return [positionMpc[0] + 0.5 * SCALE_UNITS.AU_TO_MPC, positionMpc[1], positionMpc[2]];
}

/** A camera a kiloparsec from a position — a solar sphere there is deep sub-pixel. */
function kpcFrom(positionMpc: Vec3): Vec3 {
  return [positionMpc[0] + SCALE_UNITS.KPC_TO_MPC, positionMpc[1], positionMpc[2]];
}

function stateWith(
  row: SelectionRow | null,
  starRenderer: unknown = { draw: vi.fn() },
): EngineState {
  return {
    gpu: { starRenderer },
    selectionRows: { select: row, focus: null, hover: null },
  } as unknown as EngineState;
}

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  drawIndexed: vi.fn(),
} as unknown as GPURenderPassEncoder;

/**
 * A NEAR0 SlabView whose f64 `slab.vp` and f32 `vp` are deliberately DIFFERENT
 * arrays, mirroring the `starSpheresLayer` fixture: the layer must compose from
 * `view.slab.vp` (the f64 seam), and both `draw` and `drawPick` must read the
 * same one so the pick sphere lands on the visual sphere.
 */
function makeNear0View(camPos: Vec3): SlabView {
  const slab: Slab = {
    index: NEAR0,
    nearMpc: 0.0005,
    farMpc: 500,
    vp: Float64Array.from({ length: 16 }, (_, i) => i + 0.5),
    originRelative: true,
    precision: 'f64',
    reversedZ: false,
  };
  return { slab, vp: new Float32Array(16), camPos, viewportPx: [1280, 720] };
}

/** State exposing the body pick renderer `drawPick` reads (plus the select row). */
function pickStateWith(
  row: SelectionRow | null,
  bodyPickRenderer: unknown = { drawSphere: vi.fn() },
): EngineState {
  return {
    gpu: { bodyPickRenderer },
    selectionRows: { select: row, focus: null, hover: null },
  } as unknown as EngineState;
}

/**
 * State with BOTH slots set explicitly. The select-only `stateWith` /
 * `pickStateWith` can't express the fallback the URL-restore path exercises:
 * `#focus=star-<id>` fills only `focus`, leaving `select` null, so the layer
 * resolves its row as "the `select` star, else the `focus` star". `gpu` carries
 * whichever renderer the method under test reads (starRenderer for `draw`,
 * bodyPickRenderer for `drawPick`).
 */
function slotState(
  select: SelectionRow | null,
  focus: SelectionRow | null,
  gpu: Record<string, unknown> = { starRenderer: { draw: vi.fn() } },
): EngineState {
  return {
    gpu,
    selectionRows: { select, focus, hover: null },
  } as unknown as EngineState;
}

describe('focusedFieldStarSphereLayer.enabled', () => {
  it('enables only for a star row within sphere-resolve range', () => {
    // A star row with the camera half an AU off it: the sphere clears
    // STAR_RESOLVE_PX at the camera-to-star distance → enabled.
    expect(
      focusedFieldStarSphereLayer.enabled(stateWith(STAR_ROW), makeCtx(halfAuFrom(STAR_POS))),
    ).toBe(true);

    // The SAME row with the camera a kpc off the star: the sphere is deep
    // sub-pixel → disabled. `cam.distance` is unchanged from the close case
    // (both 999), so this can only flip on the camera-to-star distance — the
    // gate subtlety the spec calls out.
    expect(
      focusedFieldStarSphereLayer.enabled(stateWith(STAR_ROW), makeCtx(kpcFrom(STAR_POS))),
    ).toBe(false);
  });

  it('is false for a non-star row and for no selection', () => {
    expect(
      focusedFieldStarSphereLayer.enabled(stateWith(GALAXY_ROW), makeCtx(halfAuFrom(STAR_POS))),
    ).toBe(false);
    expect(
      focusedFieldStarSphereLayer.enabled(stateWith(null), makeCtx(halfAuFrom(STAR_POS))),
    ).toBe(false);
  });

  it('falls back to the focus slot when select is empty — the URL-restore path', () => {
    // `#focus=star-<recordIdx>` dispatches updateSelectionFocus, filling ONLY
    // the focus slot; select stays null. The sphere must still resolve, else the
    // deep link arrives at an invisible star (the Gaia sprite is distance-retired
    // in-shader at this range). A gate reading select alone returns false here.
    expect(
      focusedFieldStarSphereLayer.enabled(slotState(null, STAR_ROW), makeCtx(halfAuFrom(STAR_POS))),
    ).toBe(true);
  });

  it('a non-star select does not suppress a star focus — the star-check is per-slot', () => {
    // A galaxy lingering in select while a star occupies focus: the fallback is
    // "select IF it is a star, else focus IF it is a star", checked per slot — NOT
    // a raw `select ?? focus` (which would pick the galaxy and return false).
    expect(
      focusedFieldStarSphereLayer.enabled(
        slotState(GALAXY_ROW, STAR_ROW),
        makeCtx(halfAuFrom(STAR_POS)),
      ),
    ).toBe(true);
  });

  it('is false while the starRenderer is null (pre-bootstrap), even for a resolvable star', () => {
    // Handle first: a null renderer disables before any ctx / row read, so a
    // bare ctx never trips it (renderFrame fixtures carry null handles).
    expect(
      focusedFieldStarSphereLayer.enabled(
        stateWith(STAR_ROW, null),
        {} as unknown as ReadyFrameContext,
      ),
    ).toBe(false);
  });
});

describe('focusedFieldStarSphereLayer.draw', () => {
  it('draws the focus-slot star when select is empty (fallback reaches the draw site)', () => {
    // draw is a distinct call site from enabled: even with enabled true, a draw
    // that read select alone would find null and early-return, leaving the URL-
    // restored sphere absent. The select-else-focus fallback must reach here too.
    const CAM = halfAuFrom(STAR_POS);
    const drawSpy = vi.fn();
    focusedFieldStarSphereLayer.draw(
      PASS_STUB,
      makeNear0View(CAM),
      makeCtx(CAM),
      slotState(null, STAR_ROW, { starRenderer: { draw: drawSpy } }),
    );
    expect(drawSpy).toHaveBeenCalledTimes(1);
  });
});

describe('focusedFieldStarSphereLayer.drawPick', () => {
  const CAM = halfAuFrom(STAR_POS);

  it('stamps the focused star’s Gaia record index — the SAME id the point pick packs', () => {
    // The sphere pick must resolve to the same star as the star's `starCatalog`
    // point pick, so it packs the star's bin-global record index (`row.index`)
    // under `Source.GaiaStars`. Hand-computed independently of the production
    // packer: (24 << 27) | (7 + 1) — the ref index 7 plus the +1 pick sentinel
    // offset the point-pick fragment also adds pre-pack.
    let packedId = -1;
    const bodyPickRenderer = {
      drawSphere: vi.fn((_pass: GPURenderPassEncoder, args: { packedId: number }) => {
        packedId = args.packedId;
      }),
    };
    focusedFieldStarSphereLayer.drawPick!(
      PASS_STUB,
      makeNear0View(CAM),
      makeCtx(CAM),
      pickStateWith(STAR_ROW, bodyPickRenderer),
    );

    expect(bodyPickRenderer.drawSphere).toHaveBeenCalledTimes(1);
    expect(packedId).toBe(((Source.GaiaStars << 27) | (7 + 1)) >>> 0);
    // And it decodes straight back to Gaia record 7 — what `resolveStarRecord`
    // then turns into the same star the visual sphere framed.
    const decoded = unpackPick(packedId)!;
    expect(decoded.sourceCode).toBe(Source.GaiaStars);
    expect(decoded.localIdx).toBe(7);
  });

  it('floors the pick sphere to the min footprint: same body center, inflated radius', () => {
    // The pick sphere is the visual sphere FLOORED to the shared min pick footprint
    // (`minPickRadiusMpc`). At half-an-AU the solar sphere clears STAR_RESOLVE_PX
    // by only a few pixels — under the 9 px-radius floor — so the pick radius
    // inflates ABOVE the visual radius. The two MVPs must therefore share the body-
    // center TRANSLATION column (same star, same screen position) while the pick
    // BASIS is scaled up (larger footprint). A site that skipped the floor would
    // leave pick == visual and the basis check fails; a site that mis-measured the
    // distance would move the translation column and that check fails.
    const view = makeNear0View(CAM);
    const ctx = makeCtx(CAM);

    const drawSpy = vi.fn();
    focusedFieldStarSphereLayer.draw(PASS_STUB, view, ctx, stateWith(STAR_ROW, { draw: drawSpy }));
    const drawMvp = drawSpy.mock.calls[0]![1] as Float32Array;

    const drawSphereSpy = vi.fn();
    focusedFieldStarSphereLayer.drawPick!(
      PASS_STUB,
      view,
      ctx,
      pickStateWith(STAR_ROW, { drawSphere: drawSphereSpy }),
    );
    const pickMvp = (drawSphereSpy.mock.calls[0]![1] as { mvp: Float32Array }).mvp;

    // Translation column (indices 12..15 = P·V·bodyCenter) is radius-independent,
    // so it is identical between pick and visual — the pick sphere is the SAME star.
    for (const i of [12, 13, 14, 15]) expect(pickMvp[i]).toBeCloseTo(drawMvp[i]!, 12);
    // The pick basis is strictly larger than the visual basis (floor active here) —
    // this is what a missing floor would fail (the two would be equal).
    expect(Math.abs(pickMvp[0]!)).toBeGreaterThan(Math.abs(drawMvp[0]!));
  });

  it('picks the focus-slot star when select is empty (fallback reaches the pick site)', () => {
    // The URL-restore path fills only focus; drawPick is a THIRD call site (after
    // enabled + draw) that must apply the same select-else-focus fallback, else the
    // deep-linked star sphere renders but is unclickable.
    const drawSphereSpy = vi.fn();
    focusedFieldStarSphereLayer.drawPick!(
      PASS_STUB,
      makeNear0View(CAM),
      makeCtx(CAM),
      slotState(null, STAR_ROW, { bodyPickRenderer: { drawSphere: drawSphereSpy } }),
    );
    expect(drawSphereSpy).toHaveBeenCalledTimes(1);
  });

  it('no-ops for a non-star row and while the bodyPickRenderer is null (gate parity with draw)', () => {
    // Same internal guards as `draw`: a non-`star` row and a null pick renderer
    // both skip the draw. (The resolve gate itself lives in `enabled`, proven
    // above — the pick program only calls `drawPick` when `enabled` is true.)
    const nonStar = vi.fn();
    focusedFieldStarSphereLayer.drawPick!(
      PASS_STUB,
      makeNear0View(CAM),
      makeCtx(CAM),
      pickStateWith(GALAXY_ROW, { drawSphere: nonStar }),
    );
    expect(nonStar).not.toHaveBeenCalled();

    expect(() =>
      focusedFieldStarSphereLayer.drawPick!(
        PASS_STUB,
        makeNear0View(CAM),
        makeCtx(CAM),
        pickStateWith(STAR_ROW, null),
      ),
    ).not.toThrow();
  });
});
