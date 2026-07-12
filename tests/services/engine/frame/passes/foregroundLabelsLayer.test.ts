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

import {
  foregroundLabelsLayer,
  SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC,
} from '../../../../../src/services/engine/frame/passes/foregroundLabelsLayer';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import { sceneBodyLabels } from '../../../../../src/services/engine/presentation/sceneBodyLabels';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { LabelRenderer } from '../../../../../src/@types/rendering/LabelRenderer';
import type { MarkerLineRenderer } from '../../../../../src/@types/rendering/MarkerLineRenderer';
import type { Label } from '../../../../../src/@types/rendering/Label';
import type { MarkerLine } from '../../../../../src/@types/rendering/MarkerLine';

// Mock rebaseViewProj so the draw test can (a) assert which vp it consumed by
// object identity — the load-bearing f64 seam — and (b) hand the layer a REAL
// (identity) projection: the leader-line placement projects each anchor through
// this matrix and un-projects it (via mat4.inverse), so an all-42 singular
// matrix would give NaN endpoints. Identity keeps every near-origin anchor in
// front of the camera (clip-w = 1) and lifts the caption purely on screen-Y.
// The rebase math itself is covered by rebaseViewProj's own precision tests.
vi.mock('../../../../../src/utils/camera/rebaseViewProj', () => ({
  rebaseViewProj: vi.fn<() => Float32Array>(
    () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  ),
}));
import { rebaseViewProj } from '../../../../../src/utils/camera/rebaseViewProj';

const rebaseMock = rebaseViewProj as unknown as ReturnType<typeof vi.fn>;

const PASS_STUB = { draw: vi.fn() } as unknown as GPURenderPassEncoder;

// `enabled` reads only `ctx.cam.distance`; `draw` also reads `ctx.fovYRad` to
// size the body's apparent diameter for the proportional lift. A bare cast with
// both fields satisfies the signature without a full frame-context fixture.
function makeCtx(distance: number): ReadyFrameContext {
  return { cam: { distance }, fovYRad: 1 } as unknown as ReadyFrameContext;
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
): EngineState {
  return {
    gpu: { foregroundLabelRenderer: renderer, foregroundMarkerLineRenderer: lineRenderer },
  } as unknown as EngineState;
}

/**
 * A NEAR0 SlabView whose f64 `slab.vp` and f32 `vp` are deliberately DIFFERENT
 * arrays, so a first-arg identity check reveals which one the layer fed to
 * `rebaseViewProj`. `camPos` is a recognisable non-zero eye so the anchor
 * rebase (`pos − camPos`) is observable in the setLabels call.
 */
function makeNear0View(): SlabView {
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
    camPos: [2, 3, 5],
    viewportPx: [1280, 720],
  };
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
    // Every body stays in the set (glyphCount stability — the enabled gate must
    // not latch off), so the length is preserved. Under the identity test vp the
    // lift is purely screen-vertical, so X and Z stay EXACTLY the camera-relative
    // anchor (proving the rebase, not the raw ~1-AU body position) while Y rises
    // by the screen-space lift (proving the caption now hangs OFF the body).
    const setSpy = renderer.setLabels as unknown as ReturnType<typeof vi.fn>;
    expect(setSpy).toHaveBeenCalledTimes(1);
    const rebasedLabels = setSpy.mock.calls[0]![0] as readonly Label[];
    const base = sceneBodyLabels();
    expect(rebasedLabels).toHaveLength(base.length);
    for (let i = 0; i < base.length; i++) {
      const anchorX = base[i]!.worldPos[0] - view.camPos[0];
      const anchorY = base[i]!.worldPos[1] - view.camPos[1];
      const anchorZ = base[i]!.worldPos[2] - view.camPos[2];
      expect(rebasedLabels[i]!.worldPos[0]).toBe(anchorX);
      expect(rebasedLabels[i]!.worldPos[2]).toBe(anchorZ);
      expect(rebasedLabels[i]!.worldPos[1]).toBeGreaterThan(anchorY); // lifted up
      // Text/styling carried through untouched — only the anchor is rebased+lifted.
      expect(rebasedLabels[i]!.text).toBe(base[i]!.text);
    }

    // ── draw receives the pass + the rebased f32 vp (NOT view.vp) + viewport ──
    const drawSpy = renderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(rebaseMock.mock.results[0]!.value);
    expect(args[1]).not.toBe(view.vp);
    expect(args[2]).toBe(view.viewportPx);
  });

  it('draws a leader line per caption, rebased into the camera-relative frame', () => {
    rebaseMock.mockClear();
    const renderer = makeRenderer(6);
    const lineRenderer = makeLineRenderer();
    const state = makeState(renderer, lineRenderer);
    const view = makeNear0View();

    foregroundLabelsLayer.draw(PASS_STUB, view, makeCtx(5e-4), state);

    // ── One connector per emitted caption ──
    // Under the identity vp every body projects in front (clip-w = 1), so the
    // lifted-label chain emits a connector for each — the leader-line treatment
    // brought to the foreground captions.
    const setLinesSpy = lineRenderer.setLines as unknown as ReturnType<typeof vi.fn>;
    expect(setLinesSpy).toHaveBeenCalledTimes(1);
    const lines = setLinesSpy.mock.calls[0]![0] as MarkerLine[];
    const base = sceneBodyLabels();
    expect(lines).toHaveLength(base.length);

    // ── The connectors are REBASED, not drawn from raw ~1-AU anchors ──
    // fromWorld is the body dot expressed camera-relative (pos − camPos), the
    // same rebase the captions ride — feeding the renderer the raw anchor would
    // reintroduce the f32 origin-distance cancellation this layer exists to dodge.
    for (let i = 0; i < base.length; i++) {
      expect(lines[i]!.fromWorld[0]).toBe(base[i]!.worldPos[0] - view.camPos[0]);
      expect(lines[i]!.fromWorld[1]).toBe(base[i]!.worldPos[1] - view.camPos[1]);
      expect(lines[i]!.fromWorld[2]).toBe(base[i]!.worldPos[2] - view.camPos[2]);
      // Distinctly NOT the raw body anchor (camPos is a non-zero eye).
      expect(lines[i]!.fromWorld).not.toEqual([...base[i]!.worldPos]);
    }

    // ── The line renderer draws with the rebased vp (NOT view.vp), before text ──
    const lineDrawSpy = lineRenderer.draw as unknown as ReturnType<typeof vi.fn>;
    expect(lineDrawSpy).toHaveBeenCalledTimes(1);
    expect(lineDrawSpy.mock.calls[0]![0]).toBe(PASS_STUB);
    expect(lineDrawSpy.mock.calls[0]![1]).toBe(rebaseMock.mock.results[0]!.value);
    expect(lineDrawSpy.mock.calls[0]![1]).not.toBe(view.vp);
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
