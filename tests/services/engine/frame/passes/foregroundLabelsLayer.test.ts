/**
 * foregroundLabelsLayer — unit tests for the near-field caption row.
 *
 * Two things are load-bearing here:
 *
 *   1. The three-clause `enabled` gate: a non-null second label renderer, a
 *      non-empty glyph set, AND a camera closer than the kiloparsec distance
 *      threshold. Above that distance the Sun/Earth are an irrelevant speck at
 *      the galactic centre and the captions would just clutter the normal view.
 *
 *   2. `draw` feeds the renderer the f64-DERIVED data, mirroring the sphere-body
 *      layers' `composeBodyMvp` seam. The caption anchors sit ~1 AU from the
 *      render origin, where the NEAR0 vp's view translation nearly cancels them
 *      in f32 — so the layer rebases both operands into the camera-relative
 *      frame before the f32 upload: anchors become `pos − camPos`, and the vp
 *      is folded via `rebaseViewProj(view.slab.vp, camPos)` (the slab's f64
 *      `vp`, NOT the f32-narrowed `view.vp`). Consuming `view.vp` would resolve
 *      the cancellation after the low-order bits are already gone.
 */

import { describe, it, expect, vi } from 'vitest';

import { foregroundLabelsLayer } from '../../../../../src/services/engine/frame/passes/foregroundLabelsLayer';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/solarSystemLabelMaxDistance';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import {
  sceneBodyLabels,
  sceneBodyLabelId,
  SCENE_STAR_LABEL_IDS,
} from '../../../../../src/services/engine/presentation/sceneBodyLabels';
import { SCALE_FADE_BANDS } from '../../../../../src/services/engine/presentation/scaleFadeBands';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';

// The Sun's caption id — its own file no longer exports one (the layer routes
// the caption by `kind === 'sun'`, and the Sun now rides a fade band rather
// than a pinned constant), so the test derives it from the shared id helper.
const SUN_LABEL_ID = sceneBodyLabelId('sun');
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { LabelRenderer } from '../../../../../src/@types/rendering/LabelRenderer';
import type { MarkerLineRenderer } from '../../../../../src/@types/rendering/MarkerLineRenderer';
import type { Label } from '../../../../../src/@types/rendering/Label';
import type { MarkerLine } from '../../../../../src/@types/rendering/MarkerLine';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// Mock rebaseViewProj so the draw test can (a) assert which vp it consumed by
// object identity — the load-bearing f64 seam — and (b) hand the layer a REAL
// (identity) projection: the leader-line placement projects each anchor through
// this matrix and un-projects it (via mat4d.inverse), so an all-42 singular
// matrix would give NaN endpoints. Identity keeps every near-origin anchor in
// front of the camera (clip-w = 1) and lifts the caption purely on screen-Y.
// Float64Array, like the real function: the layer keeps it f64 for the
// placement math and narrows to f32 only at the renderer draws. The rebase
// math itself is covered by rebaseViewProj's own precision tests.
vi.mock('../../../../../src/utils/camera/rebaseViewProj', () => ({
  rebaseViewProj: vi.fn<() => Float64Array>(
    () => new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  ),
}));
import { rebaseViewProj } from '../../../../../src/utils/camera/rebaseViewProj';

const rebaseMock = rebaseViewProj as unknown as ReturnType<typeof vi.fn>;

const PASS_STUB = { draw: vi.fn() } as unknown as GPURenderPassEncoder;

// `enabled` reads only `ctx.cam.distance`; `draw` also reads `ctx.fovYRad`
// (apparent-size math for the lift) and `ctx.nowMs` (the caption alpha
// envelope's frame clock). The envelope keeps MODULE-LEVEL state across draws,
// so the test clock auto-advances by a full minute per ctx — hundreds of
// envelope time constants — making every default-clock draw settle exactly on
// its targets. The envelope test passes explicit nowMs values to observe the
// mid-ramp behaviour instead.
let testClockMs = 0;
function makeCtx(distance: number, nowMs?: number): ReadyFrameContext {
  if (nowMs === undefined) {
    testClockMs += 60_000;
    nowMs = testClockMs;
  } else {
    testClockMs = Math.max(testClockMs, nowMs);
  }
  // The layer reads `ctx.renderTargets.depthViewOf('foreground:0')` to thread
  // the scene depth view into both draws (caption/connector occlusion), gated on
  // `ctx.renderedTargets.has('foreground:0')` (the body pass ran this frame). A
  // no-op depth stub plus `foreground:0` in the rendered set keep these tests —
  // which assert on the rebase/fade seams, not occlusion — on the occluding path.
  return {
    cam: { distance },
    fovYRad: 1,
    nowMs,
    renderTargets: { depthViewOf: () => ({}) as GPUTextureView },
    renderedTargets: new Set(['foreground:0']),
  } as unknown as ReadyFrameContext;
}

// A foreground label renderer whose glyphCount is fixed per test. `setLabels`,
// `draw`, and `measure` are spies the draw test inspects; `measure` returns null
// (the lifted-label chain degrades to a bottom at the anchor). The rest of
// LabelRenderer is unused.
function makeRenderer(glyphCount: number): LabelRenderer {
  return {
    label: 'foregroundLabelRenderer',
    setLabels: vi.fn<(labels: readonly Label[]) => void>(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    measure: vi.fn<() => null>(() => null),
    glyphCount: () => glyphCount,
  } as unknown as LabelRenderer;
}

// The leader-line sibling renderer. `setLines` + `draw` are spies the connector
// test inspects; the rest is unused.
function makeLineRenderer(): MarkerLineRenderer {
  return {
    label: 'foregroundMarkerLineRenderer',
    setLines: vi.fn<(lines: MarkerLine[]) => void>(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    lineCount: () => 0,
    destroy: vi.fn<() => void>(),
  } as unknown as MarkerLineRenderer;
}

function makeState(
  renderer: LabelRenderer | null,
  lineRenderer: MarkerLineRenderer | null = makeLineRenderer(),
  starLabelsEnabled = true,
  planetLabelsEnabled = true,
  famousStarsEnabled = true,
): EngineState {
  return {
    gpu: { foregroundLabelRenderer: renderer, foregroundMarkerLineRenderer: lineRenderer },
    settings: {
      labels: { starLabelsEnabled, planetLabelsEnabled },
      famousStars: { enabled: famousStarsEnabled },
    },
    // The envelope wakes the render loop while alphas ramp — the layer calls
    // this spy on mid-ramp frames and stays quiet once settled.
    subsystems: { scheduler: { requestRender: vi.fn<() => void>() } },
  } as unknown as EngineState;
}

/**
 * A NEAR0 SlabView whose f64 `slab.vp` and f32 `vp` are deliberately DIFFERENT
 * arrays, so a first-arg identity check reveals which one the layer fed to
 * `rebaseViewProj`. `camPos` is a recognisable non-zero eye so the anchor
 * rebase (`pos − camPos`) is observable in the setLabels call.
 */
function makeNear0View(camPos: Vec3 = [2, 3, 5]): SlabView {
  const slab: Slab = {
    index: NEAR0,
    nearMpc: 0.0005,
    farMpc: 500,
    vp: Float64Array.from({ length: 16 }, (_, i) => i + 0.5),
    originRelative: true,
    precision: 'f64',
  };
  return {
    slab,
    vp: new Float32Array(16),
    camPos,
    viewportPx: [1280, 720],
  };
}

// A rebased vp that scales x/y hugely (diag(1e12, 1e12, 1, 1)): real
// parsec-scale sky separations become thousands of px, spreading the caption
// set across the screen instead of piling every anchor onto the centre the
// identity vp produces — so declutter keeps every name. Used (via
// mockReturnValueOnce) by the fixtures that need the whole set emitted.
function makeSpreadVp(): Float64Array {
  return new Float64Array([1e12, 0, 0, 0, 0, 1e12, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

describe('foregroundLabelsLayer.enabled', () => {
  it('respects the kiloparsec distance gate', () => {
    const renderer = makeRenderer(6);
    const state = makeState(renderer);

    // Well inside a kiloparsec with glyphs present → captions show.
    expect(foregroundLabelsLayer.enabled(state, makeCtx(5e-4))).toBe(true);

    // At and above the threshold → captions hidden (no clutter at galaxy scale).
    expect(foregroundLabelsLayer.enabled(state, makeCtx(SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC))).toBe(
      false,
    );
    expect(foregroundLabelsLayer.enabled(state, makeCtx(1e-2))).toBe(false);

    // The two distance gates compose, and the caption gate is the TIGHTER
    // one: between them (bodies/backdrop already on, captions not yet) the
    // row stays off, so on descent the captions enter after the bodies. If a
    // retune ever flipped the order, the caption gate would become dead code
    // behind the shared foreground gate — this pins the intended ordering.
    expect(SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC).toBeLessThan(FOREGROUND_MAX_DISTANCE_MPC);
    const betweenGatesMpc = (SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC + FOREGROUND_MAX_DISTANCE_MPC) / 2;
    expect(foregroundLabelsLayer.enabled(state, makeCtx(betweenGatesMpc))).toBe(false);

    // No glyphs → nothing to draw even when close.
    expect(foregroundLabelsLayer.enabled(makeState(makeRenderer(0)), makeCtx(5e-4))).toBe(false);

    // Pre-bootstrap: the second label renderer hasn't been constructed yet.
    expect(foregroundLabelsLayer.enabled(makeState(null), makeCtx(5e-4))).toBe(false);
  });
});

describe('foregroundLabelsLayer.draw', () => {
  it('rebases anchors + vp into the camera-relative frame and draws them', () => {
    rebaseMock.mockClear();
    const renderer = makeRenderer(6);
    const state = makeState(renderer);
    const view = makeNear0View();

    foregroundLabelsLayer.draw(PASS_STUB, view, makeCtx(5e-4), state);

    // ── The f64 seam: rebaseViewProj consumes the slab's Float64Array vp ──
    expect(rebaseMock).toHaveBeenCalledTimes(1);
    const rebaseArgs = rebaseMock.mock.calls[0]!;
    expect(rebaseArgs[0]).toBe(view.slab.vp);
    expect(rebaseArgs[0]).not.toBe(view.vp);
    expect(rebaseArgs[1]).toBe(view.camPos);

    // ── Anchors uploaded camera-relative (pos − camPos) AND lifted ──
    // Under the identity test vp every caption projects onto the same screen
    // point, so the declutter collapses the pile to its top-priority survivors
    // — which captions emit is pinned by the declutter tests below; HERE the
    // seam is what matters, so assert it on every emitted caption: X and Z
    // stay EXACTLY the camera-relative anchor (proving the rebase, not the raw
    // ~1-AU body position) while Y rises by the screen-space lift (proving the
    // caption hangs OFF the body).
    const setSpy = renderer.setLabels as unknown as ReturnType<typeof vi.fn>;
    expect(setSpy).toHaveBeenCalledTimes(1);
    const rebasedLabels = setSpy.mock.calls[0]![0] as readonly Label[];
    const base = sceneBodyLabels();
    expect(rebasedLabels.length).toBeGreaterThan(0);
    for (const emitted of rebasedLabels) {
      const src = base.find((l) => l.id === emitted.id)!;
      const anchorX = src.worldPos[0] - view.camPos[0];
      const anchorY = src.worldPos[1] - view.camPos[1];
      const anchorZ = src.worldPos[2] - view.camPos[2];
      expect(emitted.worldPos[0]).toBe(anchorX);
      expect(emitted.worldPos[2]).toBe(anchorZ);
      expect(emitted.worldPos[1]).toBeGreaterThan(anchorY); // lifted up
      expect(emitted.text).toBe(src.text);
    }

    // ── draw receives the pass + the f32 NARROW of the rebased vp (NOT
    // view.vp) + viewport. The narrow happens at the upload boundary, so the
    // uploaded matrix is a Float32Array with the mock's element values. ──
    const drawSpy = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toEqual(new Float32Array(rebaseMock.mock.results[0]!.value as Float64Array));
    expect(args[1]).not.toBe(view.vp);
    expect(args[2]).toBe(view.viewportPx);
  });

  it('draws a leader line per emitted caption, rebased into the camera-relative frame', () => {
    rebaseMock.mockClear();
    const renderer = makeRenderer(6);
    const lineRenderer = makeLineRenderer();
    const state = makeState(renderer, lineRenderer);
    const view = makeNear0View();

    foregroundLabelsLayer.draw(PASS_STUB, view, makeCtx(5e-4), state);

    // ── One connector per emitted caption, rebased + bottom-lifted ──
    // Under the identity vp every emitted body projects in front (clip-w = 1),
    // so the lifted-label chain emits a connector for each declutter survivor.
    // fromWorld is the dot expressed camera-relative (pos − camPos) — feeding
    // the renderer the raw ~1-AU anchor would reintroduce the f32
    // origin-distance cancellation this layer exists to dodge — then lifted a
    // small screen distance (apparent radius + LEADER_LINE_BOTTOM_GAP_PX) so
    // the line's bottom ends ABOVE the body instead of at its centre. The lift
    // is purely screen-vertical under the identity vp, so X and Z stay exactly
    // the camera-relative anchor while Y sits strictly above it.
    const setLinesSpy = lineRenderer.setLines as unknown as ReturnType<typeof vi.fn>;
    expect(setLinesSpy).toHaveBeenCalledTimes(1);
    const lines = setLinesSpy.mock.calls[0]![0] as MarkerLine[];
    const base = sceneBodyLabels();
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const src = base.find((l) => `${l.id}-anchor` === line.id)!;
      expect(line.fromWorld[0]).toBe(src.worldPos[0] - view.camPos[0]);
      expect(line.fromWorld[1]).toBeGreaterThan(src.worldPos[1] - view.camPos[1]);
      expect(line.fromWorld[2]).toBe(src.worldPos[2] - view.camPos[2]);
      // Distinctly NOT the raw body anchor (camPos is a non-zero eye).
      expect(line.fromWorld).not.toEqual([...src.worldPos]);
    }

    // ── The line renderer draws with the f32 narrow of the rebased vp (NOT
    // view.vp), before the text ──
    const lineDrawSpy = lineRenderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(lineDrawSpy).toHaveBeenCalledTimes(1);
    expect(lineDrawSpy.mock.calls[0]![0]).toBe(PASS_STUB);
    expect(lineDrawSpy.mock.calls[0]![1]).toEqual(
      new Float32Array(rebaseMock.mock.results[0]!.value as Float64Array),
    );
    expect(lineDrawSpy.mock.calls[0]![1]).not.toBe(view.vp);
  });

  it('suppresses star captions when the toggle is off', () => {
    const renderer = makeRenderer(6);
    const lineRenderer = makeLineRenderer();
    // Park the camera ~1e-12 Mpc from Proxima — deep inside the neighbourhood,
    // so its caption is at full alpha and WOULD show — the toggle-off must drop
    // it anyway, while Earth/planets keep showing.
    const base = sceneBodyLabels();
    const proxima = base.find((l) => l.id === sceneBodyLabelId('proxima-centauri'))!;
    const camPos: Vec3 = [proxima.worldPos[0] - 1e-12, proxima.worldPos[1], proxima.worldPos[2]];

    // Toggle ON: at least one star caption (Proxima) is emitted.
    const onView = makeNear0View(camPos);
    foregroundLabelsLayer.draw(PASS_STUB, onView, makeCtx(5e-4), makeState(renderer, lineRenderer));
    const onSpy = renderer.setLabels as unknown as ReturnType<typeof vi.fn>;
    const onLabels = onSpy.mock.calls[0]![0] as readonly Label[];
    expect(onLabels.some((l) => SCENE_STAR_LABEL_IDS.has(l.id))).toBe(true);

    // Toggle OFF: no star caption at all (the Sun is a star too), but Earth still shows.
    const offRenderer = makeRenderer(6);
    const offView = makeNear0View(camPos);
    foregroundLabelsLayer.draw(
      PASS_STUB,
      offView,
      makeCtx(5e-4),
      makeState(offRenderer, makeLineRenderer(), false),
    );
    const offSpy = offRenderer.setLabels as unknown as ReturnType<typeof vi.fn>;
    const offLabels = offSpy.mock.calls[0]![0] as readonly Label[];
    expect(offLabels.some((l) => SCENE_STAR_LABEL_IDS.has(l.id))).toBe(false);
    expect(offLabels.some((l) => l.id === sceneBodyLabelId('earth'))).toBe(true);
  });

  it('suppresses the star map but KEEPS the Sun when the famous-stars gate is off', () => {
    // Camera at Earth (deep inside the neighbourhood), spread vp so declutter
    // keeps every separated caption. The famousStars gate is a THIRD, independent
    // mute switch: with it off the seeded star map drops — but the Sun (its own
    // `sunCaption` band) and Earth still show. This is the caption twin of the
    // point/sphere layers falling back to the Sun alone.
    const base = sceneBodyLabels();
    const earthId = sceneBodyLabelId('earth');
    const earth = base.find((l) => l.id === earthId)!;
    const camPos: Vec3 = [...earth.worldPos] as Vec3;

    // Gate ON: at least one NON-Sun star caption emits.
    rebaseMock.mockReturnValueOnce(makeSpreadVp());
    const onRenderer = makeRenderer(6);
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(5e-4),
      makeState(onRenderer, makeLineRenderer(), true, true, true),
    );
    const onSpy = onRenderer.setLabels as unknown as ReturnType<typeof vi.fn>;
    const onLabels = onSpy.mock.calls[0]![0] as readonly Label[];
    expect(onLabels.some((l) => SCENE_STAR_LABEL_IDS.has(l.id) && l.id !== SUN_LABEL_ID)).toBe(
      true,
    );

    // Gate OFF (famousStars): no non-Sun star caption, but the Sun + Earth still show.
    rebaseMock.mockReturnValueOnce(makeSpreadVp());
    const offRenderer = makeRenderer(6);
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(5e-4),
      makeState(offRenderer, makeLineRenderer(), true, true, false),
    );
    const offSpy = offRenderer.setLabels as unknown as ReturnType<typeof vi.fn>;
    const offLabels = offSpy.mock.calls[0]![0] as readonly Label[];
    expect(offLabels.some((l) => SCENE_STAR_LABEL_IDS.has(l.id) && l.id !== SUN_LABEL_ID)).toBe(
      false,
    );
    expect(offLabels.some((l) => l.id === SUN_LABEL_ID)).toBe(true);
    expect(offLabels.some((l) => l.id === earthId)).toBe(true);
  });

  it('suppresses Earth + planet captions when the planet toggle is off', () => {
    // Camera at Earth, spread vp so declutter keeps every separated caption:
    // with the planet toggle ON the Earth caption emits; with it OFF the Earth
    // + planet set drops while the star map keeps showing. The two mute switches
    // are independent.
    const base = sceneBodyLabels();
    const earthId = sceneBodyLabelId('earth');
    const earth = base.find((l) => l.id === earthId)!;
    const camPos: Vec3 = [...earth.worldPos] as Vec3;

    // Toggle ON: the Earth caption is emitted.
    rebaseMock.mockReturnValueOnce(makeSpreadVp());
    const onRenderer = makeRenderer(6);
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(5e-4),
      makeState(onRenderer, makeLineRenderer()),
    );
    const onSpy = onRenderer.setLabels as unknown as ReturnType<typeof vi.fn>;
    const onLabels = onSpy.mock.calls[0]![0] as readonly Label[];
    expect(onLabels.some((l) => l.id === earthId)).toBe(true);

    // Toggle OFF (planet): no Earth/planet caption, but the star map still shows.
    rebaseMock.mockReturnValueOnce(makeSpreadVp());
    const offRenderer = makeRenderer(6);
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(5e-4),
      makeState(offRenderer, makeLineRenderer(), true, false),
    );
    const offSpy = offRenderer.setLabels as unknown as ReturnType<typeof vi.fn>;
    const offLabels = offSpy.mock.calls[0]![0] as readonly Label[];
    expect(offLabels.some((l) => l.id === earthId)).toBe(false);
    expect(offLabels.some((l) => SCENE_STAR_LABEL_IDS.has(l.id))).toBe(true);
  });

  it('shows the local neighbourhood at full alpha from Earth and none beyond the neighbourhood', () => {
    const base = sceneBodyLabels();
    const starLabels = (labels: readonly Label[]) =>
      labels.filter((l) => SCENE_STAR_LABEL_IDS.has(l.id));

    // ── Camera at Earth: the LOCAL STAR MAP. The seed now mixes true
    // neighbourhood stars with distant famous supergiants (Deneb at 802 pc,
    // Rigel at 264 pc), so only the stars INSIDE the starCaption full-alpha
    // band emit at fadeAlpha 1 — the "whole map" is the local set, derived
    // from the band rather than the whole seed table (which would strand this
    // assertion the moment a distant star was seeded). The spread vp keeps the
    // declutter from eating any of them (see makeSpreadVp).
    rebaseMock.mockReturnValueOnce(makeSpreadVp());
    const earth = base.find((l) => l.id === sceneBodyLabelId('earth'))!;
    const camPos = earth.worldPos;
    const fullAlphaStarIds = base
      .filter((l) => SCENE_STAR_LABEL_IDS.has(l.id))
      .filter((l) => {
        // The caption fade keys on the star's OWN distance from the camera, pc.
        const distPc =
          Math.hypot(
            l.worldPos[0] - camPos[0],
            l.worldPos[1] - camPos[1],
            l.worldPos[2] - camPos[2],
          ) / SCALE_UNITS.PC_TO_MPC;
        return distPc <= SCALE_FADE_BANDS.starCaption.fullAt;
      })
      .map((l) => l.id);
    expect(fullAlphaStarIds.length).toBeGreaterThan(0);

    const nearRenderer = makeRenderer(6);
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View([...camPos] as Vec3),
      makeCtx(5e-4),
      makeState(nearRenderer, makeLineRenderer()),
    );
    const nearSpy = nearRenderer.setLabels as unknown as ReturnType<typeof vi.fn>;
    const nearLabels = nearSpy.mock.calls[0]![0] as readonly Label[];
    const byId = new Map(starLabels(nearLabels).map((l) => [l.id, l]));
    for (const id of fullAlphaStarIds) {
      const emitted = byId.get(id);
      expect(emitted, `expected ${id} emitted from Earth`).toBeDefined();
      expect(emitted!.fadeAlpha, `expected ${id} at full alpha from Earth`).toBe(1);
    }

    // ── Camera far outside the neighbourhood (Mpc-scale, past every seed's
    // gone edge AND past the Sun's own fade band's gone edge): every star
    // caption fades to 0 and is dropped — the Sun included, now that it rides
    // `sunCaption` (gone at the layer's enable gate) rather than a pinned 1.
    const farRenderer = makeRenderer(6);
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View([2, 3, 5]),
      makeCtx(5e-4),
      makeState(farRenderer, makeLineRenderer()),
    );
    const farSpy = farRenderer.setLabels as unknown as ReturnType<typeof vi.fn>;
    const farLabels = farSpy.mock.calls[0]![0] as readonly Label[];
    expect(starLabels(farLabels)).toHaveLength(0);
  });

  it('fades the Sun caption in on descent — exactly 0 at the enable gate, no pop', () => {
    // The Sun sits at the render origin, so parking the eye `originDistMpc` out
    // along +X makes the Sun caption's own distance-from-camera equal that value
    // — the quantity `sunCaption` keys on. The identity rebase vp piles every
    // caption onto screen centre, where the Sun (top declutter tier) is the
    // survivor, so it is the emitted star caption to read. The auto-advancing
    // test clock settles each draw exactly onto its target.
    const renderer = makeRenderer(6);
    const sunFade = (originDistMpc: number): number | undefined => {
      foregroundLabelsLayer.draw(
        PASS_STUB,
        makeNear0View([originDistMpc, 0, 0]),
        makeCtx(5e-4),
        makeState(renderer, makeLineRenderer()),
      );
      const spy = renderer.setLabels as unknown as ReturnType<typeof vi.fn>;
      const labels = spy.mock.calls.at(-1)![0] as readonly Label[];
      return labels.find((l) => l.id === SUN_LABEL_ID)?.fadeAlpha;
    };

    // At the enable gate the caption is EXACTLY 0 — the no-pop anchor. `goneAt`
    // is the layer's gate BY IMPORT, so the Sun is invisible the frame the layer
    // switches on (target 0 → dropped from the emit set) and can only fade UP
    // from there. A drifted goneAt would surface the Sun with a hard edge here.
    expect(sunFade(SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC)).toBeUndefined();

    // Mid-band (three-quarters of the way to the gate): a genuine FRACTION,
    // strictly inside (0, 1) — the pin that fails if the band is inverted or
    // left pinned at a constant.
    const mid = sunFade(0.75 * SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);

    // At and below the full edge (half the gate distance) the name holds at full
    // alpha all the way down.
    expect(sunFade(SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC / 2)).toBe(1);
    expect(sunFade(1e-5)).toBe(1);
  });

  it('prefers the higher CAPTION_PRIORITY tier when captions collide', () => {
    // Camera parked on Proxima: its apparent size is enormous while the Sun,
    // 1.3 pc away, is sub-pixel — pure apparent-size priority would keep
    // Proxima. Under the identity vp every caption piles onto one screen
    // point, and the pile's survivor is the SUN: the kind tier (sun 40 >
    // earth 30 > planet 20 > star 10) dominates the composed declutter score;
    // apparent size only breaks ties within a tier.
    const base = sceneBodyLabels();
    const proxima = base.find((l) => l.id === sceneBodyLabelId('proxima-centauri'))!;
    const camPos: Vec3 = [proxima.worldPos[0] - 1e-12, proxima.worldPos[1], proxima.worldPos[2]];
    const renderer = makeRenderer(6);
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(5e-4),
      makeState(renderer, makeLineRenderer()),
    );
    const spy = renderer.setLabels as unknown as ReturnType<typeof vi.fn>;
    const labels = spy.mock.calls[0]![0] as readonly Label[];
    expect(labels.some((l) => l.id === SUN_LABEL_ID)).toBe(true);
    expect(labels.some((l) => l.id === proxima.id)).toBe(false);
  });

  it('eases a declutter flip instead of popping, then settles and goes quiet', () => {
    const base = sceneBodyLabels();
    const proxima = base.find((l) => l.id === sceneBodyLabelId('proxima-centauri'))!;
    const camPos: Vec3 = [proxima.worldPos[0] - 1e-12, proxima.worldPos[1], proxima.worldPos[2]];
    const renderer = makeRenderer(6);
    const lastLabels = () => {
      const spy = renderer.setLabels as unknown as ReturnType<typeof vi.fn>;
      return spy.mock.calls.at(-1)![0] as readonly Label[];
    };
    const wakeSpy = (state: EngineState) =>
      (
        state as unknown as {
          subsystems: { scheduler: { requestRender: ReturnType<typeof vi.fn> } };
        }
      ).subsystems.scheduler.requestRender;

    // Settle: the spread vp separates every caption, so Proxima survives
    // declutter and (deep inside the neighbourhood) settles at exactly 1.
    rebaseMock.mockReturnValueOnce(makeSpreadVp());
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(5e-4),
      makeState(renderer, makeLineRenderer()),
    );
    expect(lastLabels().find((l) => l.id === proxima.id)!.fadeAlpha).toBe(1);
    const t0 = testClockMs;

    // FLIP: back on the identity vp everything piles onto one screen point and
    // the Sun's tier wins — Proxima's declutter survival flips to 0. One
    // envelope time constant (100 ms) later the drawn alpha has moved
    // FRACTIONALLY toward 0, not jumped: still emitted, strictly inside (0,1).
    const rampState = makeState(renderer, makeLineRenderer());
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(5e-4, t0 + 100),
      rampState,
    );
    const mid = lastLabels().find((l) => l.id === proxima.id);
    expect(mid).toBeDefined();
    expect(mid!.fadeAlpha).toBeGreaterThan(0);
    expect(mid!.fadeAlpha).toBeLessThan(1);
    // Mid-ramp frames wake the render loop so the fade animates under
    // render-on-demand.
    expect(wakeSpy(rampState)).toHaveBeenCalled();

    // Another step: still easing monotonically toward 0.
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(5e-4, t0 + 200),
      makeState(renderer, makeLineRenderer()),
    );
    const later = lastLabels().find((l) => l.id === proxima.id);
    expect(later).toBeDefined();
    expect(later!.fadeAlpha).toBeLessThan(mid!.fadeAlpha!);

    // Far in the future the ramp completes: Proxima's caption is gone.
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(5e-4),
      makeState(renderer, makeLineRenderer()),
    );
    expect(lastLabels().find((l) => l.id === proxima.id)).toBeUndefined();

    // A settled caption stops changing AND stops waking the loop: the Sun (the
    // pile's survivor) holds exactly 1 across consecutive small-dt draws, and
    // neither draw requests another frame.
    const settledA = makeState(renderer, makeLineRenderer());
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(5e-4, testClockMs + 50),
      settledA,
    );
    expect(lastLabels().find((l) => l.id === SUN_LABEL_ID)!.fadeAlpha).toBe(1);
    expect(wakeSpy(settledA)).not.toHaveBeenCalled();
    const settledB = makeState(renderer, makeLineRenderer());
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(5e-4, testClockMs + 50),
      settledB,
    );
    expect(lastLabels().find((l) => l.id === SUN_LABEL_ID)!.fadeAlpha).toBe(1);
    expect(wakeSpy(settledB)).not.toHaveBeenCalled();
  });

  it('draws captions even when the leader-line renderer is null (bootstrap gap)', () => {
    const renderer = makeRenderer(6);
    const view = makeNear0View();
    // Line renderer not yet constructed: the captions must still draw, the
    // connectors just skipped — the line handle is an optional bootstrap resource.
    const state = makeState(renderer, null);
    foregroundLabelsLayer.draw(PASS_STUB, view, makeCtx(5e-4), state);
    expect(renderer.draw as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the foreground renderer is null (pre-bootstrap)', () => {
    const view = makeNear0View();
    const state = makeState(null);
    expect(() => foregroundLabelsLayer.draw(PASS_STUB, view, makeCtx(5e-4), state)).not.toThrow();
  });
});
