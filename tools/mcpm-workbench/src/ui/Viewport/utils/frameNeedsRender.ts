/**
 * frameNeedsRender — the render-on-demand predicate: does THIS tick need to reach the
 * encoder? Any true term forces a render; all false means the last drawn frame is
 * still exactly what the user would see, so Viewport.tsx's frame() skips the GPU work.
 * Pure so the boundary cases (sample cap, hold deadline) get a real unit test instead
 * of living only in a manual checklist.
 */
export type FrameNeedsRenderInputs = {
  /** A store write, pointer event, or canvas resize since the last frame — see
   *  storeWriteIsDirty.ts for the store-write half (the FPS-badge exclusion lives there). */
  readonly dirty: boolean;
  readonly simRunning: boolean;
  readonly pathTracerOn: boolean;
  /** Progressive accumulator sample count vs. its cap — see ViewSlice.d.ts's
   *  pathTracer.sampleCap doc comment for the convergence rationale. */
  readonly pathTracerSampleCount: number;
  readonly pathTracerSampleCap: number;
  /** The latest deadline any time-based visual window is still holding open (e.g. the
   *  box-preview flash) — a plain "still before the deadline" term. */
  readonly holdUntilMs: number;
  readonly nowMs: number;
};

export function frameNeedsRender(inputs: FrameNeedsRenderInputs): boolean {
  return (
    inputs.dirty ||
    inputs.simRunning ||
    (inputs.pathTracerOn && inputs.pathTracerSampleCount < inputs.pathTracerSampleCap) ||
    inputs.nowMs < inputs.holdUntilMs
  );
}
