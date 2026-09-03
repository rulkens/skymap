/**
 * pickFrameContext — the pick-time camera, expressed as a value.
 *
 * ### What this is
 *
 * A click / hover resolves which galaxy sits under the cursor by drawing the
 * scene into the r32uint pick texture from the SAME camera the user is looking
 * at. The alternative — capturing that camera as a render-time side effect, a
 * per-frame byte snapshot stashed onto engine state for the pick pass to
 * replay — braids the pick camera into frame ordering: the pick pass can only
 * run if a visual frame has already stashed, and "what camera does the pick
 * use?" has no value you can name, only a buffer that must be populated at
 * the right moment.
 *
 * `pickFrameContext` is a plain derivation instead: it re-derives a full
 * `ReadyFrameContext` from the pose the last frame actually rendered
 * (`state.cameraRuntime.displayedPose.current`, projection included — see
 * `CameraRuntime.d.ts`) and the live projection config
 * (`state.cameraRuntime.projection`) — so the pick camera matches the frame
 * on screen exactly, yet it is a value the pick path can ask for on demand,
 * independent of whether a visual frame just ran.
 *
 * ### Why the pick mask, not the draw mask
 *
 * `deriveFrameContext`'s `visibleSourceMask` becomes `ctx.visibleSourceMask`,
 * which every `drawPick` reads to decide which sources to rasterise into the
 * pick texture. Pick follows INTENT, not pixels: a galaxy catalog toggled off is
 * unclickable immediately, even while its draw-mask bit lingers through the
 * fade-out tail (see `deriveSourceMasks`'s draw-vs-pick divergence). So this
 * helper threads `deriveSourceMasks(state).pick` — not `.draw` — and the
 * resulting `ctx.visibleSourceMask` means "pickable sources" to every downstream
 * pick draw — the one place the pickable-source filter lives.
 *
 * ### Why this is side-effect-free
 *
 * `deriveFrameContext` is documented side-effect-free (see `frameContext.ts` —
 * the module header's "the clock is advanced by `runFrame`'s produce step, not
 * here" guarantee, restated at the `deriveFrameContext` docblock): it only calls
 * `assembleOrbitCamera`, `computeViewProj`, and `deriveSlabs`. It does NOT tick
 * the camera clock or advance any fade controller. That is precisely what makes
 * it safe to call speculatively at pick time — the pick path can re-derive the
 * frame camera without perturbing the animation state the visual loop owns.
 *
 * Returns `null` when the engine has not finished bootstrapping (the
 * `FrameContext.isReady` gate is false), so the pick path can bail cleanly
 * before any GPU handle is touched.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { deriveFrameContext } from '../frame/frameContext';
import { deriveSourceMasks } from '../frame/deriveSourceMasks';
import { liveWorldPose } from './liveWorldPose';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

export function pickFrameContext(
  state: EngineState,
  canvas: HTMLCanvasElement,
): ReadyFrameContext | null {
  const ctx = deriveFrameContext(
    state,
    canvas,
    // The pose the last frame actually rendered — the same value that frame's
    // `deriveFrameContext` received, so the pick camera matches the frame on
    // screen.
    liveWorldPose(state),
    // The framed pose `liveWorldPose` resolved from — the DISPLAYED box, so
    // the pick pass's provider-B routing matches the screen. NOT `lastPose`:
    // the authored register is untilted in-window, and a pick against it
    // lands on the wrong object.
    state.cameraRuntime.displayedPose.current,
    state.cameraRuntime.projection,
    // Pick is a demand read at rest (between frames), so the steady
    // `ORIENTATION_FRAMES[orientation]` is the correct basis for BOTH halves —
    // the same reasoning as `buildDemandCtx`'s `cameraPosMpc`. At rest the live
    // `upBasis` a real frame would resolve equals this steady value anyway, so
    // there is nothing to diverge; the pick camera decodes both position and
    // screen-up through the pole the frame drew with.
    ORIENTATION_FRAMES[state.settings.orientation],
    ORIENTATION_FRAMES[state.settings.orientation],
    // Pick mask, not draw mask: pickability follows intent (see docblock).
    deriveSourceMasks(state).pick,
    // Pick-time wall clock. No animated consumer reads it in the pick pass —
    // it exists only to satisfy the shared `deriveFrameContext` contract — but
    // sampling here keeps a consistent "now" for any value that does stamp it.
    performance.now(),
    // Sim instant: the one the last frame derived its bodies at, so pickable
    // body sprites are re-derived exactly where they were drawn — the time
    // analogue of reading `displayedPose.current` for the pose. Single-writer state
    // (`runFrame` only), so an unrelated `deriveBodyStates(CONST_J2000)` between
    // frames cannot repoint the epoch the pick sees.
    state.cameraRuntime.lastRenderedSimDays.current,
  );
  return ctx.isReady ? ctx : null;
}
