/**
 * foregroundLabelsLayer — two load-bearing properties of the caption row.
 *
 * The `enabled` gate must read DEMAND, never `renderer.glyphCount()`: once every
 * target hits 0, `setLabels([])` zeroes it and the gate latches false forever.
 *
 * `draw` must feed the renderer f64-DERIVED data — anchors as `pos − camPos`, vp
 * folded from the slab's f64 `vp`, NOT the narrowed `view.vp`, which resolves the
 * ~1 AU cancellation only after the low-order bits are gone.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { foregroundLabelsLayer } from '../../../../../src/services/engine/frame/passes/foregroundLabelsLayer';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/solarSystemLabelMaxDistance';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import {
  sceneBodyLabels,
  sceneBodyLabelId,
} from '../../../../../src/services/engine/presentation/sceneBodyLabels';
import { SCALE_FADE_BANDS } from '../../../../../src/services/engine/presentation/scaleFadeBands';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { makeBodyItems } from '../../../../fixtures/makeBodyItems';
import { SGR_A_STAR_ENTRY } from '../../../../../src/data/sources/sgr-a-star';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';

// The layer derives its caption set from the frame's body snapshot
// (`sceneBodyStates(state, ctx)` → `deriveBodyStates(ctx.simDays)`). These tests
// pin `ctx.simDays` at J2000, so `sceneBodyLabels(J2000_STATES)` reproduces the
// exact anchors the layer builds (the memo returns the same map by reference).
const J2000_STATES = deriveBodyStates(CONST_J2000);

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
import type { Label2D } from '../../../../../src/@types/rendering/Label2D';
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
    // The constellation gate reads the heliocentric-origin camera distance off
    // drawCamPos (matching constellationsLayer.enabled); park the eye on +X at
    // the same distance the body gate reads.
    drawCamPos: [distance, 0, 0],
    fovYRad: 1,
    nowMs,
    // The layer binds its caption epoch to ctx.simDays via sceneBodyStates; pin
    // it at J2000 so the anchors match J2000_STATES.
    simDays: CONST_J2000,
    renderTargets: { depthViewOf: () => ({}) as GPUTextureView },
    renderedTargets: new Set(['foreground:0']),
    // resolveLayerOpacity lerps its recession factor on this; an absent one
    // makes the constellation caption target NaN.
    focusBlend: 0,
  } as unknown as ReadyFrameContext;
}

// A foreground label renderer whose glyphCount is fixed per test. `setLabels`,
// `draw`, and `measure` are spies the draw test inspects; `measure` returns null
// (the lifted-label chain degrades to a bottom at the anchor). The rest of
// LabelRenderer is unused.
function makeRenderer(glyphCount: number): LabelRenderer {
  return {
    label: 'foregroundLabelRenderer',
    setLabels: vi.fn<(labels: readonly Label2D[]) => void>(),
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

/**
 * `bodyLabels` seeds ALL body rows from one flag by default, so a test that
 * only cares whether body captions are on at all passes a bare boolean; the
 * per-row cases pass the bits separately, which is the axis those rows buy. A
 * row the object form does not name stays on — only the boolean form means
 * "every body caption off", which is what the demand-gate tests assert against.
 */
function makeState(
  renderer: LabelRenderer | null,
  lineRenderer: MarkerLineRenderer | null = makeLineRenderer(),
  starMapLabelsEnabled = true,
  // `true`/`false` sets every row at once; a record names the rows that deviate
  // from an all-on baseline (the Sun included, which defaults on).
  bodyLabels: boolean | Readonly<Record<string, boolean>> = true,
  starMapEnabled = true,
  sunVisible = true,
  starCatalogsMasterEnabled = true,
): EngineState {
  const named: Record<string, boolean> =
    typeof bodyLabels === 'boolean' ? {} : { ...bodyLabels, sun: bodyLabels.sun ?? true };
  const unnamed = typeof bodyLabels === 'boolean' ? bodyLabels : true;
  return {
    gpu: { foregroundLabelRenderer: renderer, foregroundMarkerLineRenderer: lineRenderer },
    settings: {
      labels: { focusedOnly: false },
      // `sunVisible` is the Sun's separate VISIBILITY axis (`items.sun.enabled`)
      // — the same flag `visibleStars` reads to hide its dot — independent of
      // `labelEnabled`. Every other row keeps the fixture's all-on baseline.
      bodies: {
        items: makeBodyItems((id) => ({
          ...(id === 'sun' ? { enabled: sunVisible } : {}),
          labelEnabled: named[id] ?? unnamed,
        })),
      },
      // The cluster master defaults on: the caption's visibility gate requires
      // it AND the row's own bit, matching how `visibleStars` composes the
      // pair. `starCatalogsMasterEnabled` lets a test drop the master alone,
      // independent of the row-level `famousStar.enabled`.
      starCatalogs: {
        enabled: starCatalogsMasterEnabled,
        items: { famousStar: { enabled: starMapEnabled, labelEnabled: starMapLabelsEnabled } },
      },
    },
    // No constellation slot by default — the body-caption tests never exercise
    // the figure-name path, so the layer reads an empty set and skips the toggle
    // + fade-registry reads entirely (the constellation tests below supply a
    // ready slot). The layer reads `state.assetSlots.constellations`, so the key
    // must exist even when null.
    assetSlots: { constellations: null },
    // The envelope wakes the render loop while alphas ramp — the layer calls
    // this spy on mid-ramp frames and stays quiet once settled.
    subsystems: { scheduler: { requestRender: vi.fn<() => void>() } },
  } as unknown as EngineState;
}

// Two figures at parsec-scale anchors, spread on the sky so an identity-ish vp
// keeps them apart in the declutter. The names are the caption ids.
const CONSTELLATION_ARTIFACT = {
  version: 1 as const,
  constellations: [
    {
      name: 'Orion',
      labelAnchorPc: [200, -50, 100] as Vec3,
      segments: [{ aPc: [1, 2, 3] as Vec3, aAppMag: 0.5, bPc: [4, 5, 6] as Vec3, bAppMag: 1.2 }],
    },
    {
      name: 'Ursa Major',
      labelAnchorPc: [-30, 80, 12] as Vec3,
      segments: [{ aPc: [7, 8, 9] as Vec3, aAppMag: 2, bPc: [10, 11, 12] as Vec3, bAppMag: 2.4 }],
    },
  ],
};

// A state whose constellation slot is READY, with the fade-registry opacity
// under test control. The body-caption toggles are all on so those captions
// coexist with the figure names.
/**
 * `makeBodyItems` deviation muting the Galactic Centre's caption. It is the one
 * body caption whose reach extends past `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC`,
 * so any test asserting "the row is off out here" has to silence it or it is
 * asserting against a caption that is legitimately still on.
 */
const GALACTIC_CENTRE_LABEL_OFF = (id: string) =>
  id === SGR_A_STAR_ENTRY.id ? { labelEnabled: false } : {};

function makeConstellationState(opts: { layerFade: number; ready?: boolean }): EngineState {
  return {
    gpu: {
      foregroundLabelRenderer: makeRenderer(6),
      foregroundMarkerLineRenderer: makeLineRenderer(),
    },
    settings: {
      labels: { focusedOnly: false },
      // The Galactic Centre's caption reaches past the body gate on its own
      // (`captionFadeRules`), so these tests — which isolate the CONSTELLATION
      // demand term out there — must mute it or they measure both at once.
      bodies: { items: makeBodyItems(GALACTIC_CENTRE_LABEL_OFF) },
      starCatalogs: { enabled: true, items: { famousStar: { enabled: true, labelEnabled: true } } },
      constellations: {},
    },
    assetSlots: {
      constellations:
        (opts.ready ?? true)
          ? { state: () => ({ kind: 'ready', value: CONSTELLATION_ARTIFACT }) }
          : null,
    },
    subsystems: {
      scheduler: { requestRender: vi.fn<() => void>() },
      fades: { opacityOf: () => opts.layerFade },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
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
    reversedZ: false,
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

// `enabled` now folds the module-level `captionAlpha` envelope state into its
// ENVELOPE TAIL clause, so a test asserting the gate goes dark needs that map
// genuinely empty rather than carrying a settled `1` left by an unrelated
// earlier test (the map is a module singleton — see the layer's own header —
// so it persists across every test in this file). Driving every caption's
// target to 0 (the star map's label gate and EVERY body row's off — the boolean
// `bodyLabels` form, which is why that form has to reach rows no test names)
// with NO constellation slot and a full-clock-advance `makeCtx` settles every
// currently-tracked id EXACTLY to 0 in one draw: `draw`'s own end-of-frame prune
// deletes any id outside this frame's entry universe (which, with no
// constellation slot, is body captions only), so a stray constellation id from
// an earlier test is dropped too.
function settleAllCaptions(): void {
  foregroundLabelsLayer.draw(
    PASS_STUB,
    makeNear0View([1e6, 1e6, 1e6]),
    makeCtx(5e-4),
    makeState(makeRenderer(0), makeLineRenderer(), false, false),
  );
}

beforeEach(() => {
  settleAllCaptions();
});

describe('foregroundLabelsLayer.enabled', () => {
  it('respects the kiloparsec distance gate', () => {
    const renderer = makeRenderer(6);
    // Every body label on EXCEPT the Galactic Centre's: its caption reaches past
    // this gate by design (see `captionFadeRules`), so leaving it on would keep
    // the row alive out here for a reason that has nothing to do with the
    // solar-system gate under test.
    const state = makeState(renderer, makeLineRenderer(), true, {
      [SGR_A_STAR_ENTRY.id]: false,
    });

    // Well inside a kiloparsec with body-caption toggles on → captions show.
    expect(foregroundLabelsLayer.enabled(state, makeCtx(5e-4))).toBe(true);

    // At and above the threshold → captions hidden (no clutter at galaxy scale).
    expect(foregroundLabelsLayer.enabled(state, makeCtx(SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC))).toBe(
      false,
    );
    expect(foregroundLabelsLayer.enabled(state, makeCtx(1e-2))).toBe(false);

    // …and the Galactic Centre's own caption is exactly what carries the row
    // past that gate, which is the whole point of its separate reach.
    const withGalacticCentre = makeState(renderer);
    expect(foregroundLabelsLayer.enabled(withGalacticCentre, makeCtx(1e-2))).toBe(true);

    // The two distance gates compose, and the caption gate is the TIGHTER
    // one: between them (bodies/backdrop already on, captions not yet) the
    // row stays off, so on descent the captions enter after the bodies. If a
    // retune ever flipped the order, the caption gate would become dead code
    // behind the shared foreground gate — this pins the intended ordering.
    expect(SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC).toBeLessThan(FOREGROUND_MAX_DISTANCE_MPC);
    const betweenGatesMpc = (SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC + FOREGROUND_MAX_DISTANCE_MPC) / 2;
    expect(foregroundLabelsLayer.enabled(state, makeCtx(betweenGatesMpc))).toBe(false);

    // Pre-bootstrap: the second label renderer hasn't been constructed yet.
    expect(foregroundLabelsLayer.enabled(makeState(null), makeCtx(5e-4))).toBe(false);
  });

  it('regression: an empty last-drawn glyph set does not latch the gate off', () => {
    // This is the reported bug's exact mechanism: the renderer's LAST
    // `setLabels` call was empty (as it is right after a demand-drop draw),
    // yet the settings now demand a caption again — `enabled` must read that
    // demand fresh rather than the stale artifact. A prior version of the
    // gate short-circuited on `renderer.glyphCount() === 0` and returned
    // false here regardless of the toggles, latching the row off forever.
    const renderer = makeRenderer(0);
    const state = makeState(renderer, undefined, /* starMapLabelsEnabled */ true, false);
    expect(foregroundLabelsLayer.enabled(state, makeCtx(5e-4))).toBe(true);
  });

  it('reads each body-caption toggle as its own source of demand', () => {
    // Star toggle alone is enough demand, with every body toggle off.
    expect(
      foregroundLabelsLayer.enabled(
        makeState(makeRenderer(0), undefined, true, false),
        makeCtx(5e-4),
      ),
    ).toBe(true);
    // Planet toggle alone is enough demand, with the star toggle off.
    expect(
      foregroundLabelsLayer.enabled(
        makeState(makeRenderer(0), undefined, false, true),
        makeCtx(5e-4),
      ),
    ).toBe(true);
    // The Sun's own row alone is enough demand. The Sun rides the star map's
    // seed table, so a gate that summarised it under the map's switch would
    // read dark here while `draw` wanted the Sun's name on screen.
    expect(
      foregroundLabelsLayer.enabled(
        makeState(makeRenderer(0), undefined, false, { earth: false, planet: false, sun: true }),
        makeCtx(5e-4),
      ),
    ).toBe(true);
    // Both off, no constellation slot, and no caption mid-fade (a fresh
    // module state — see the "settled" test below for the envelope-tail
    // half of this) → no demand at all, so the row stays off. This is the
    // "opacity 0 ⇒ no render" house rule applied to the gate itself.
    expect(
      foregroundLabelsLayer.enabled(
        makeState(makeRenderer(0), undefined, false, false),
        makeCtx(5e-4),
      ),
    ).toBe(false);
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
    const rebasedLabels = setSpy.mock.calls[0]![0] as readonly Label2D[];
    const base = sceneBodyLabels(J2000_STATES);
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
    const base = sceneBodyLabels(J2000_STATES);
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

  it('eases a declutter flip instead of popping, then settles and goes quiet', () => {
    const base = sceneBodyLabels(J2000_STATES);
    const proxima = base.find((l) => l.id === sceneBodyLabelId('proxima-centauri'))!;
    const camPos: Vec3 = [proxima.worldPos[0] - 1e-12, proxima.worldPos[1], proxima.worldPos[2]];
    const renderer = makeRenderer(6);
    const lastLabels = () => {
      const spy = renderer.setLabels as unknown as ReturnType<typeof vi.fn>;
      return spy.mock.calls.at(-1)![0] as readonly Label2D[];
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

  it('keeps enabled() true through a demand-drop fade-out, then false once settled', () => {
    // Earth's caption to full alpha. Spread vp so Earth de-collides from the
    // Sun (their anchors are ~1 AU apart, which the identity vp used by
    // default would pile onto the same screen point, and the Sun's higher
    // priority tier would win the declutter, leaving Earth's target at 0
    // regardless of the toggle this test exercises).
    const base = sceneBodyLabels(J2000_STATES);
    const earthId = sceneBodyLabelId('earth');
    const earth = base.find((l) => l.id === earthId)!;
    const camPos: Vec3 = [...earth.worldPos] as Vec3;
    const renderer = makeRenderer(6);
    rebaseMock.mockReturnValueOnce(makeSpreadVp());
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(5e-4),
      makeState(renderer, makeLineRenderer()),
    );
    const t0 = testClockMs;

    // Demand drops: the planet toggle switches off, dropping Earth's target to
    // 0. A short dt later the envelope has only PARTLY eased down — the
    // caption is still emitted, strictly between 0 and 1.
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(5e-4, t0 + 20),
      makeState(renderer, makeLineRenderer(), true, false),
    );
    const setSpy = renderer.setLabels as unknown as ReturnType<typeof vi.fn>;
    const midAlpha = (setSpy.mock.calls.at(-1)![0] as readonly Label2D[]).find(
      (l) => l.id === earthId,
    )?.fadeAlpha;
    expect(midAlpha).toBeGreaterThan(0);
    expect(midAlpha).toBeLessThan(1);

    // With demand OFF (both toggles off, camera past the body-caption gate,
    // no constellation slot) the settings alone say "off" — but the ENVELOPE
    // TAIL keeps `enabled` true while Earth's caption is still fading out, so
    // the row draws one more frame instead of popping to invisible.
    const offSettingsState = makeState(renderer, makeLineRenderer(), false, false);
    expect(
      foregroundLabelsLayer.enabled(offSettingsState, makeCtx(SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC)),
    ).toBe(true);

    // Let the ramp run to completion (a full-clock-advance draw settles every
    // caption exactly onto its target, per the envelope's settle snap).
    foregroundLabelsLayer.draw(
      PASS_STUB,
      makeNear0View(camPos),
      makeCtx(5e-4),
      makeState(renderer, makeLineRenderer(), false, false),
    );
    const settledLabels = (renderer.setLabels as unknown as ReturnType<typeof vi.fn>).mock.calls.at(
      -1,
    )![0] as readonly Label2D[];
    expect(settledLabels.some((l) => l.id === earthId)).toBe(false);

    // Now that nothing is mid-fade AND settings demand nothing, the gate goes
    // dark — the "opacity 0 ⇒ no render" house rule, applied to the layer's
    // own enable gate rather than a single caption's draw alpha.
    expect(
      foregroundLabelsLayer.enabled(offSettingsState, makeCtx(SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC)),
    ).toBe(false);
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

describe('foregroundLabelsLayer — constellation captions', () => {
  // A camera distance PAST the body-caption gate but still inside the
  // constellation band (the band fades to 0 at goneAt, beyond that gate) — the
  // exact window the old director-registered producer could never reach because
  // the COSMO near plane clipped the parsec-scale anchors. The row must stay
  // enabled here on the constellation gate alone.
  const pastBodyGate =
    (SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC + SCALE_FADE_BANDS.constellations.goneAt) / 2;

  it('runs the row past the body-caption gate while a figure name could show', () => {
    expect(pastBodyGate).toBeGreaterThan(SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC);

    // Body-only state (no constellation slot): past the body gate the row is
    // off. The Galactic Centre's caption is muted here for the reason
    // `GALACTIC_CENTRE_LABEL_OFF` records — it reaches past this gate by design.
    expect(
      foregroundLabelsLayer.enabled(
        makeState(makeRenderer(6), makeLineRenderer(), true, { [SGR_A_STAR_ENTRY.id]: false }),
        makeCtx(pastBodyGate),
      ),
    ).toBe(false);

    // Artifact ready: the constellation gate keeps the row alive at the same
    // distance — the fix's core.
    expect(
      foregroundLabelsLayer.enabled(
        makeConstellationState({ layerFade: 1 }),
        makeCtx(pastBodyGate),
      ),
    ).toBe(true);

    // Beyond the band's far edge the distance band reads 0 ⇒ off regardless of
    // the toggle (the "opacity 0 ⇒ no render" house rule, the band-only cull).
    expect(
      foregroundLabelsLayer.enabled(
        makeConstellationState({ layerFade: 1 }),
        makeCtx(SCALE_FADE_BANDS.constellations.goneAt),
      ),
    ).toBe(false);
  });
});
