/**
 * flyout — the "fly to the observable horizon" `Clip` (id + label + serializable
 * `ClipData`).
 *
 * Derived from the `flyoutDriver` recording spike (`?flyout`) — see
 * `docs/research/2026-06-19-camera-animation-spike-findings.md`.
 *
 * ### What this demonstrates
 *
 * This clip is the acceptance proof for the animation data model (Plan A,
 * Task 13). It re-expresses the flyout camera spike — a smooth zoom from the
 * user's current viewing distance out to the Hubble radius (~29 500 Mpc) with a
 * gentle quarter-turn — as a plain serializable `ClipData`.
 *
 * Two things make it a meaningful model exercise:
 *
 *   1. `start: 'live'` — the clip does not bake a fixed start pose. The
 *      clip-player resolves `'live'` to the actual camera position at playback
 *      time via `resolveClipStart`, so the flyout works from any viewing
 *      distance. This is the dynamic-start path in the model.
 *
 *   2. Concurrent `all([dollyTo, spin])` — `distance` and `yaw` are driven by
 *      two base writers running in parallel, each on a distinct channel.
 *      `compileClip` validates the single-writer constraint at registration time;
 *      a two-channel `all` is the simplest proof that the constraint is checked
 *      correctly (no clash).
 *
 * The log-dolly (`dollyTo`) zooms at a perceptually uniform rate: 10 → 100 Mpc
 * feels the same duration as 100 → 10 000 Mpc. This is the geometric
 * interpolation path in the evaluator (`lerpInSpace('log', ...)`).
 *
 * `start: 'live'` means the starting distance is captured at playback time.
 * Call `resolveClipStart(flyout.data, livePose)` before evaluation in tests or
 * in the clip-player, so the evaluator receives a concrete numeric
 * `start.distance`.
 */

import type { Clip } from '../../../@types/animation/Clip';
import { dollyTo, spin, all } from '../../../services/engine/animation/effectHelpers';

export const flyout: Clip = {
  id: 'flyout',
  label: 'Fly to Horizon',
  data: {
    start: 'live', // dolly from wherever the user is framed
    timeline: [
      all([
        dollyTo(29_500, 22, 'easeInOutCubic'), // log-dolly to the horizon shell
        spin('yaw', { by: 1.1, over: 22, ease: 'easeInOutCubic' }), // gentle quarter-turn
      ]),
    ],
  },
};
