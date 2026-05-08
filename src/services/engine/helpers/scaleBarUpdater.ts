/**
 * scaleBarUpdater — per-engine wrapper around `computeScaleInfo`.
 *
 * `helpers/scaleBar.ts` owns the *pure* math: given a camera, a canvas
 * size, and a target pixel width, decide what label to show
 * ("100 Mpc", "50 kpc", …) and how many pixels wide to render the bar.
 * That helper has no opinion on dedup, callbacks, or "is the camera
 * even ready yet?".
 *
 * This factory is the engine-frame-local glue around it:
 *
 *   - Reads the LIVE `state.cam` reference at call time (rather than
 *     a snapshot) because the camera doesn't exist until the first
 *     cloud lands, and `runFrame.ts` calls the updater every tick from
 *     t=0 onward.  The `if (!state.cam) return` guard absorbs the
 *     pre-camera-ready window.
 *   - Reads `canvas.clientWidth/Height` (CSS pixels, not the
 *     backing-store dimensions) so the bar's physical width on screen
 *     stays DPR-independent — a 150-CSS-pixel target shows the same
 *     thickness on a 1× and a 3× display.
 *   - Dedups via a closure-local `lastScaleSig` so React's
 *     `setState` only fires when the visible value actually changes.
 *     The signature is a string concatenation (`"${label}:${widthPx}"`)
 *     because it's cheap to compare and trivially correct: two calls
 *     produce identical signatures iff both scalar fields match
 *     bit-for-bit.
 *
 * ### Why a factory (not a free function)
 *
 * The dedup state (`lastScaleSig`) MUST persist across frames.  A free
 * function would have to either:
 *
 *   (a) Take a `{current: string}` ref from the caller, leaking the
 *       dedup mechanism into engine.ts — which is exactly the noise we
 *       wanted to lift out.
 *   (b) Use a module-level `let`, which would break the moment the app
 *       supports two engines (currently impossible, but the singleton
 *       isn't a load-bearing assumption — keeping the dedup
 *       per-instance costs nothing and forecloses one accidental
 *       coupling).
 *
 * Returning a closure that captures its own `lastScaleSig` keeps the
 * state inside the helper and lets `engine.ts` treat the returned
 * function as a black box — exactly the same shape `createTweenManager`
 * / `createSelectionSubsystem` / `createSpaceMouseSubsystem` use, so
 * the lift slots into the existing subsystem-factory pattern without
 * introducing a new idiom.
 *
 * ### Why `targetPx` is configurable
 *
 * `engine.ts` passes `150` (the SCALE_TARGET_PX constant); the default
 * argument here matches that so callers don't have to repeat it.  Tests
 * can pass a smaller target to exercise the niceRound→label boundary at
 * different scales without rebuilding a full engine.  Configurability
 * is free here — one extra parameter — and the explicit name documents
 * the intent at call sites that DO override it.
 */

import type { EngineCallbacks, EngineState } from '../../../@types';
import { computeScaleInfo } from './scaleBar';

const DEFAULT_SCALE_TARGET_PX = 150;

export type ScaleBarUpdaterDeps = {
  state: EngineState;
  canvas: HTMLCanvasElement;
  cb: EngineCallbacks;
  targetPx?: number;
};

export function createScaleBarUpdater(deps: ScaleBarUpdaterDeps): () => void {
  const { state, canvas, cb } = deps;
  const targetPx = deps.targetPx ?? DEFAULT_SCALE_TARGET_PX;

  let lastSig = '';

  return function updateScaleBar(): void {
    if (!state.cam) return;

    const info = computeScaleInfo({
      cam: state.cam,
      canvasSize: { width: canvas.clientWidth, height: canvas.clientHeight },
      targetPx,
    });
    if (info === null) return;

    const sig = `${info.label}:${info.widthPx}`;
    if (sig === lastSig) return;
    lastSig = sig;

    cb.onScaleChange(info);
  };
}
