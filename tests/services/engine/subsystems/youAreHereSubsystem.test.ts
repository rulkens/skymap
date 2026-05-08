/**
 * youAreHereSubsystem — unit tests for the closure-returning facade
 * that drives the "YOU ARE HERE" marker's alpha-transition state and
 * calls into `LabelRenderer.setLabels` / `MarkerLineRenderer.setLines`.
 *
 * Coverage:
 *
 *   1. no_renderers_attached — `runFrame` returns without throwing
 *      when no renderers have been attached yet (pre-atlas-load window).
 *
 *   2. frame_at_zero_distance — camera at origin → alpha=1 → `setLabels`
 *      and `setLines` each called once with non-empty arrays.
 *
 *   3. same_alpha_no_re_upload — second frame at the same distance →
 *      no further `setLabels` / `setLines` calls (prevAlpha guard).
 *
 *   4. far_distance_clears — frame at 5 Mpc (well outside the 2 Mpc
 *      far limit) → alpha=0 → `setLabels([])` and `setLines([])` called.
 *
 *   5. mid_fade_requests_render — frame at ~1.3 Mpc (inside the
 *      0.6–2.0 Mpc fade band) → alpha between 0 and 1 →
 *      `scheduler.requestRender()` called.
 *
 * Stub patterns mirror `biasCorrectionSubsystem.test.ts`: plain objects
 * that implement only the surface the subsystem actually calls.
 */

import { describe, it, expect, vi } from 'vitest';
import { createYouAreHereSubsystem } from '../../../../src/services/engine/subsystems/youAreHereSubsystem';
import type { LabelRenderer, Label } from '../../../../src/services/gpu/renderers/labelRenderer';
import type { MarkerLineRenderer, MarkerLine } from '../../../../src/services/gpu/renderers/markerLineRenderer';
import type { EngineState } from '../../../../src/@types';
import type { ReadyFrameContext } from '../../../../src/services/engine/frame/frameContext';

// ─── Stub helpers ──────────────────────────────────────────────────────────

/** Minimal stub for LabelRenderer — captures `setLabels` calls. */
function makeStubLabelRenderer() {
  const calls: Label[][] = [];
  const stub: Pick<LabelRenderer, 'setLabels' | 'render' | 'glyphCount' | 'labelCount' | 'destroy'> =
    {
      setLabels: vi.fn((labels: Label[]) => { calls.push([...labels]); }),
      render: vi.fn(),
      glyphCount: vi.fn(() => 0),
      labelCount: vi.fn(() => 0),
      destroy: vi.fn(),
    };
  return { stub: stub as LabelRenderer, calls };
}

/** Minimal stub for MarkerLineRenderer — captures `setLines` calls. */
function makeStubLineRenderer() {
  const calls: MarkerLine[][] = [];
  const stub: Pick<MarkerLineRenderer, 'setLines' | 'render' | 'lineCount' | 'destroy'> = {
    setLines: vi.fn((lines: MarkerLine[]) => { calls.push([...lines]); }),
    render: vi.fn(),
    lineCount: vi.fn(() => 0),
    destroy: vi.fn(),
  };
  return { stub: stub as MarkerLineRenderer, calls };
}

/**
 * Build a minimal EngineState stub with only the field the subsystem
 * touches: `subsystems.scheduler.requestRender`.
 */
function makeStubState(): { state: EngineState; requestRender: ReturnType<typeof vi.fn> } {
  const requestRender = vi.fn();
  // The subsystem only reads `state.subsystems.scheduler.requestRender`.
  // We use a deep-partial cast to avoid constructing the whole EngineState
  // shape — this is the same approach used in
  // biasCorrectionSubsystem.test.ts.
  const state = {
    subsystems: {
      scheduler: { requestRender },
    },
  } as unknown as EngineState;
  return { state, requestRender };
}

/**
 * Build a ReadyFrameContext stub with only `drawCamPos` populated.
 * The subsystem reads nothing else from the context.
 */
function makeCtx(x: number, y: number, z: number): ReadyFrameContext {
  return { drawCamPos: [x, y, z] } as unknown as ReadyFrameContext;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('youAreHereSubsystem', () => {
  it('no_renderers_attached — runFrame returns without throwing', () => {
    const subsystem = createYouAreHereSubsystem();
    const { state } = makeStubState();
    // No attachRenderers call — renderers are still null.
    expect(() => subsystem.runFrame(state, makeCtx(0, 0, 0))).not.toThrow();
  });

  it('frame_at_zero_distance — setLabels and setLines each called once', () => {
    const subsystem = createYouAreHereSubsystem();
    const { stub: labelStub, calls: labelCalls } = makeStubLabelRenderer();
    const { stub: lineStub, calls: lineCalls } = makeStubLineRenderer();
    subsystem.attachRenderers(labelStub, lineStub);

    const { state } = makeStubState();
    subsystem.runFrame(state, makeCtx(0, 0, 0));

    // setLabels should have been called once with a non-empty array.
    expect(vi.isMockFunction(labelStub.setLabels)).toBe(true);
    expect(labelCalls).toHaveLength(1);
    expect(labelCalls[0]).toHaveLength(1);
    expect(labelCalls[0]![0]!.text).toBe('You are here');

    // setLines should have been called once with a non-empty array.
    expect(lineCalls).toHaveLength(1);
    expect(lineCalls[0]).toHaveLength(1);
    expect(lineCalls[0]![0]!.id).toBe('you-are-here');
  });

  it('same_alpha_no_re_upload — second frame at same distance produces no new calls', () => {
    const subsystem = createYouAreHereSubsystem();
    const { stub: labelStub, calls: labelCalls } = makeStubLabelRenderer();
    const { stub: lineStub, calls: lineCalls } = makeStubLineRenderer();
    subsystem.attachRenderers(labelStub, lineStub);

    const { state } = makeStubState();
    const ctx = makeCtx(0, 0, 0);

    // First frame — writes because prevAlpha was -1.
    subsystem.runFrame(state, ctx);
    const callsAfterFirst = labelCalls.length;
    expect(callsAfterFirst).toBe(1);

    // Second frame at the same distance — alpha unchanged → no new uploads.
    subsystem.runFrame(state, ctx);
    expect(labelCalls.length).toBe(callsAfterFirst); // no new entry
    expect(lineCalls.length).toBe(callsAfterFirst);  // no new entry
  });

  it('far_distance_clears — alpha=0 clears both renderers', () => {
    const subsystem = createYouAreHereSubsystem();
    const { stub: labelStub, calls: labelCalls } = makeStubLabelRenderer();
    const { stub: lineStub, calls: lineCalls } = makeStubLineRenderer();
    subsystem.attachRenderers(labelStub, lineStub);

    const { state } = makeStubState();

    // First run at origin to get alpha=1 written and prevAlpha stored.
    subsystem.runFrame(state, makeCtx(0, 0, 0));
    const callsAfterClose = labelCalls.length;

    // Then move far away (5 Mpc >> FAR threshold of 2 Mpc) → alpha=0.
    subsystem.runFrame(state, makeCtx(5, 0, 0));

    // Should have added one more call each — an empty-array clear.
    expect(labelCalls.length).toBe(callsAfterClose + 1);
    expect(lineCalls.length).toBe(callsAfterClose + 1);
    // The clearing call passes empty arrays.
    expect(labelCalls[labelCalls.length - 1]).toEqual([]);
    expect(lineCalls[lineCalls.length - 1]).toEqual([]);
  });

  it('mid_fade_requests_render — alpha between 0 and 1 wakes the loop', () => {
    const subsystem = createYouAreHereSubsystem();
    const { stub: labelStub } = makeStubLabelRenderer();
    const { stub: lineStub } = makeStubLineRenderer();
    subsystem.attachRenderers(labelStub, lineStub);

    const { state, requestRender } = makeStubState();

    // 1.3 Mpc is inside the 0.6–2.0 Mpc fade band, so alpha ∈ (0, 1).
    subsystem.runFrame(state, makeCtx(1.3, 0, 0));

    expect(requestRender).toHaveBeenCalledTimes(1);
  });
});
