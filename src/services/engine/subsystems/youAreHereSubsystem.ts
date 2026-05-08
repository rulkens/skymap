/**
 * youAreHereSubsystem — owns the "YOU ARE HERE" marker's alpha-transition
 * state and drives the label + marker-line renderers from the per-frame
 * camera position.
 *
 * ### Why a subsystem?
 *
 * The "you are here" feature has three ingredients that make it a natural
 * fit for the closure-keyed-factory pattern every other subsystem here uses:
 *
 *   1. **Mutable alpha state** (`prevAlpha`) that persists across frames —
 *      not derivable fresh each frame from the camera alone because the
 *      "has alpha changed?" check needs the previous value to decide whether
 *      to re-upload to the GPU.
 *   2. **Cross-renderer side-effects** — one frame's decision touches both
 *      `LabelRenderer.setLabels` and `MarkerLineRenderer.setLines`.  A free
 *      function in `engine.ts` would have to be called with four arguments
 *      (prevAlpha ref + both renderers + camera) and would re-introduce the
 *      kind of call-site scatter that Phase D pulled out.
 *   3. **Optional attachment** — the renderers don't exist at the moment the
 *      engine state literal is evaluated (GPU hasn't been acquired yet).
 *      `attachRenderers` is the same post-construction wiring pattern
 *      `biasCorrectionSubsystem` uses for `attachRenderer`.
 *
 * ### The `prevAlpha` skip optimisation
 *
 * `youAreHereAlpha` has three states: 0, 1, or a smoothstep intermediate.
 * The 0 and 1 cases are the steady states; the camera spends the vast
 * majority of its lifetime in one of them.  Checking `alpha === prevAlpha`
 * before calling `setLabels` / `setLines` avoids GPU buffer uploads and
 * React-tick side-effects on every frame when the camera is far from the
 * origin (the typical "zoomed out" view).  -1 sentinel forces a write on
 * the first frame after `attachRenderers` regardless of the computed alpha.
 *
 * ### Why `requestRender()` only mid-transition?
 *
 * Render-on-demand is the project's policy (see `renderScheduler.ts`).
 * When alpha is 0 or 1, the marker is fully off or fully on — no further
 * changes are expected until the camera moves, which will wake the loop on
 * its own via the orbit-controls event handler.  The only window where we
 * need the loop to stay awake independent of user input is while alpha is
 * somewhere in (0, 1), when the smoothstep is still evolving.  That's
 * exactly the condition we check.
 *
 * ### Why labels + marker-line stay off `isEngineReady`
 *
 * See `engineReady.ts`'s module header: optional resources null-check at
 * point of use, not at the bootstrap gate.  The atlas load is async and
 * the engine should not be held back from rendering point clouds while it
 * waits for a ~120 KB font fetch.  The null-check at the top of
 * `runFrame` is the point-of-use guard.
 */

import type { LabelRenderer, Label } from '../../gpu/renderers/labelRenderer';
import type { MarkerLineRenderer, MarkerLine } from '../../gpu/renderers/markerLineRenderer';
import type { ReadyFrameContext } from '../frame/frameContext';
import type { EngineState } from '../../../@types';
import { youAreHereAlpha } from '../../gpu/labels/youAreHereVisibility';

/** Public handle returned by `createYouAreHereSubsystem`. */
export type YouAreHereSubsystem = {
  /**
   * Wire the label and marker-line renderers in once `initGpu` has
   * constructed them.  Idempotent: calling this twice replaces the
   * previous renderers and resets `prevAlpha` so the next frame
   * forces a full GPU re-upload regardless of the cached state.
   */
  attachRenderers(label: LabelRenderer, line: MarkerLineRenderer): void;
  /**
   * Per-frame entry point — called from `runFrame.ts` after the bootstrap
   * gate passes.  Internally null-checks the renderers, so this call is
   * safe even before the atlas load and `initGpu` renderer construction
   * complete (the brief window between engine start and atlas fetch).
   */
  runFrame(state: EngineState, ctx: ReadyFrameContext): void;
};

/** The text displayed as the label. */
const LABEL_TEXT = 'YOU ARE HERE';

/**
 * World-space height of the marker line, in Mpc.  The label sits at the
 * top of this line, just above the world origin (the Milky Way barycentre).
 * 0.05 Mpc ≈ 50 kpc — about half the radius of the Milky Way's stellar
 * disk, which puts the line just high enough to be readable against
 * the Milky Way impostor without overlapping it at normal close-zoom angles.
 */
const LINE_HEIGHT_MPC = 0.05;

/**
 * Label colour: premultiplied white at full alpha.
 * MSDF labels are UI overlay (premultiplied-OVER blend), so full premultiplied
 * white means the final colour is driven entirely by the label's `fadeAlpha`
 * field — the subsystem controls visibility via that field, not via the colour.
 */
const LABEL_COLOR: [number, number, number, number] = [1, 1, 1, 1];

/**
 * Line colour: slightly dimmed premultiplied white.
 * A shade less bright than the label so the line visually recedes behind the
 * text rather than competing with it.
 */
const LINE_COLOR: [number, number, number, number] = [0.85, 0.85, 0.85, 1];

export function createYouAreHereSubsystem(): YouAreHereSubsystem {
  let labelRenderer: LabelRenderer | null = null;
  let lineRenderer: MarkerLineRenderer | null = null;

  // Prev-alpha sentinel: -1 = "never written yet".  The first frame after
  // `attachRenderers` always writes, regardless of the computed alpha, so
  // the renderers start in a known-consistent state rather than reflecting
  // whatever `prevAlpha` happened to be from a previous subsystem instance.
  let prevAlpha = -1;

  function attachRenderers(label: LabelRenderer, line: MarkerLineRenderer): void {
    labelRenderer = label;
    lineRenderer = line;
    // Reset so the next frame forces a GPU write — the new renderers are
    // empty and need to be populated even if the camera distance hasn't
    // changed since the last set.
    prevAlpha = -1;
  }

  function runFrame(state: EngineState, ctx: ReadyFrameContext): void {
    // Null-check at point of use (same pattern as filamentRenderer in
    // filamentsPass.ts): the renderers don't exist until `initGpu` completes
    // the atlas fetch, constructs them, and calls `attachRenderers`.  We
    // silently no-op during that brief pre-attach window rather than
    // gating the entire engine on the atlas load finishing.
    if (!labelRenderer || !lineRenderer) return;

    // Camera distance from the world origin (the Milky Way's adopted
    // barycentre in catalogue coordinates).
    const camDist = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    const alpha = youAreHereAlpha(camDist);

    // Skip GPU upload when alpha hasn't changed.  The typical steady state
    // is alpha=0 (camera far from origin) or alpha=1 (deep zoom on the
    // Milky Way); both are stable for long runs.  Only the mid-transition
    // case — alpha in (0, 1) while the camera is crossing the fade band
    // — needs a per-frame upload, and that is signalled via the
    // `requestRender()` call at the end of this function.
    if (alpha === prevAlpha) return;

    if (alpha > 0) {
      const labels: Label[] = [
        {
          id: 'you-are-here',
          worldPos: [0, LINE_HEIGHT_MPC, 0],
          text: LABEL_TEXT,
          pixelSize: 18,
          color: LABEL_COLOR,
          worldEmMpc: 0.005,
          fadeAlpha: alpha,
        },
      ];
      const lines: MarkerLine[] = [
        {
          id: 'you-are-here',
          fromWorld: [0, 0, 0],
          toWorld: [0, LINE_HEIGHT_MPC, 0],
          pixelWidth: 1.5,
          color: LINE_COLOR,
          fadeAlpha: alpha,
        },
      ];
      labelRenderer.setLabels(labels);
      lineRenderer.setLines(lines);
    } else {
      // alpha === 0 but prevAlpha !== 0 → camera just crossed outside
      // the fade band.  Clear both renderers so the draw calls become
      // cheap no-ops (glyphCount / lineCount return 0).
      labelRenderer.setLabels([]);
      lineRenderer.setLines([]);
    }
    prevAlpha = alpha;

    // Keep the loop awake while alpha is mid-transition (0 < alpha < 1).
    // Once alpha settles at 0 or 1 the camera-motion event handlers take
    // over waking the loop, so we don't need to re-schedule here.
    if (alpha > 0 && alpha < 1) {
      state.subsystems.scheduler.requestRender();
    }
  }

  return { attachRenderers, runFrame };
}
