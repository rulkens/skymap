/**
 * hoverPickDriver — the pointer-driven hover-pick scheduler.
 *
 * Owns hover-pick scheduling end to end, fully decoupled from the render
 * frame. The Option-1 throttling model: `mapAsync` GPU readback latency
 * (1–2 frames) is itself the natural throttle — `pickInFlight` cannot clear
 * until the GPU finishes, so picks physically cannot fire faster than once
 * per readback regardless of mouse speed. No rAF, no `requestRender`, no
 * frame dependency.
 *
 * ### Why NOT in-frame (the old model)
 *
 * The in-frame pick (`runFrame.ts:404–491`) mutated the visual render's
 * shared uniform buffer and depended on the next visual frame to undo the
 * damage. That created a two-writer hazard: the frame was required merely
 * to clean up after hover. Every `pointermove` over a static scene forced a
 * full 2.5M-point re-render just to rewrite a buffer. This driver eliminates
 * both problems — hover reads its own snapshot (the last-frame uniform bytes
 * on `state.picking`) and writes to the pick renderer's own buffer.
 *
 * ### Trailing-edge re-fire
 *
 * A fast flick followed by a stop produces many mid-flight moves (all
 * coalesced and dropped). The `maybeFire()` inside `.finally` replaces the
 * per-frame retry the old path gave: after each pick settles, if `latest`
 * has advanced past `picked`, a new pick is fired immediately. Without this,
 * a stopped cursor would never get a hover result for its resting position.
 *
 * ### No requestRender
 *
 * Hover feeds only the React InfoCard text; there is no hover halo in the
 * rendered scene, so a hover change requires no re-render. `HoverPickDeps`
 * has no scheduler field — the dep type is the structural guarantee.
 */

import { cssToTexPx } from '../helpers/cssToTexPx';
import { resolvePick } from '../helpers/resolvePick';
import { updateSelectionHover } from '../../../state/selection/selectionSlice';
import type { HoverPickDeps } from '../../../@types/engine/interaction/HoverPickDeps';
import type { CssPx } from '../../../@types/input/CssPx';

export function createHoverPickDriver(deps: HoverPickDeps): {
  onPointerMove(pos: CssPx): void;
} {
  // `latest` tracks the most recent pointer position the user has moved to
  // (every move updates it). `picked` records the position we last kicked a
  // GPU pick for. The equality guard `latest === picked` (by reference) means
  // "we've already fired a pick for this exact pointer position object" — a
  // new `CssPx` object is constructed each event, so the guard is correct
  // without a coordinate comparison.
  let latest: CssPx | null = null;
  let picked: CssPx | null = null;

  function onPointerMove(pos: CssPx): void {
    latest = pos;
    maybeFire();
  }

  function maybeFire(): void {
    // Coalesce: a second pick while the first readback is in flight wastes
    // GPU work and risks reading stale results. The `.finally` will re-call
    // maybeFire() after the in-flight pick settles, so the resting position
    // is always caught (trailing edge, see module docblock).
    if (deps.state.picking.pickInFlight) return;

    // Nothing new to pick: `latest === null` means no pointer event yet;
    // `latest === picked` means we already have a result for this position.
    if (latest === null || latest === picked) return;

    fire(latest);
  }

  function fire(pos: CssPx): void {
    // Snapshot the uniform bytes from the last visual frame. Null means no
    // frame has run yet — skip to match pre-first-frame behaviour (the old
    // in-frame path also had no picks before the first frame).
    const bytes = deps.state.picking.lastFrameUniformBytes;
    if (bytes === null) return;

    // Derive pick targets LIVE at fire time (same rule as the click path).
    // A snapshot at driver-construction time would be stale the moment a
    // catalog is toggled or a fade completes.
    const targets = deps.collectTargets();
    if (!targets.hasAny) return;

    // Record the position we're about to pick so the trailing-edge guard
    // (`latest === picked`) can tell when we've already caught up to the
    // resting position. Set pickInFlight before the async call so a racing
    // pointermove between this line and `pick()`'s first await cannot sneak
    // through the coalesce gate.
    picked = pos;
    deps.state.picking.pickInFlight = true;

    deps.pickRenderer
      .pick(
        deps.viewportPx(),
        cssToTexPx(pos.x),
        cssToTexPx(pos.y),
        targets.visibleSources,
        deps.pointSizePx(),
        bytes,
        deps.timingDescriptor(),
      )
      .then((hit) =>
        deps.store.dispatch(updateSelectionHover(resolvePick(hit, deps.resolveDeps))),
      )
      .finally(() => {
        deps.state.picking.pickInFlight = false;
        // Trailing edge: fire a new pick if the pointer has moved since we
        // started this one. Without this, a fast flick followed by a stop
        // would never pick the resting position — all mid-flight moves were
        // coalesced and there is no further `pointermove` to re-trigger.
        maybeFire();
      });
  }

  return { onPointerMove };
}
