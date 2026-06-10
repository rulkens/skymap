/**
 * tweenManager — owns the engine's at-most-one in-flight CameraTween.
 *
 * Before this module existed the engine kept a single mutable
 * `let currentTween: CameraTween | null = null;` as a closure variable.
 * Five separate sites read or wrote it — `frame()` (advance + clear),
 * the `pointerdown` handler (cancel on user grab), the SpaceMouse
 * per-frame block (cancel when the puck is deflected), and three
 * public-handle methods (`focusOn`, `focusOnHome`, `selectFamous`)
 * that all replaced the running tween.
 *
 * That spread made it easy to:
 *   - add a fourth cancel site (e.g. a future keyboard shortcut) and
 *     forget that "cancel" means "set to null" rather than "abort
 *     gracefully",
 *   - introduce a still-animating predicate that compared the
 *     reference rather than asking "is a tween in flight?",
 *   - leak the literal CameraTween shape into call sites that only
 *     needed to know "there's something running".
 *
 * The manager collapses all of that into a four-method facade:
 *
 *   - `start(tween)`  — replace the running tween with a new one.
 *   - `cancel()`      — clear the running tween, no-op if none.
 *   - `isActive()`    — boolean predicate for the still-animating gate.
 *   - `advance(...)`  — per-frame step; returns whether the tween
 *                       just finished so the caller can choose to
 *                       schedule additional follow-on work (none today).
 *
 * Wake contract: `start()` wakes the render scheduler — callers never
 * follow up with `requestRender`.  `cancel()` and `advance()` stay
 * wake-free: their call sites (input mouths, frame internals) are already
 * awake.  `deps.requestRender` is required, so a forgotten wake source is
 * a compile error, not a silent gap.
 *
 * ### Why a factory rather than a class?
 *
 * Matches the rest of the engine subsystems
 * (createRenderScheduler, createThumbnailSubsystem, …).  A factory
 * returning a typed handle keeps the internal `currentTween` reference
 * genuinely inaccessible — there is no `manager.currentTween` for a
 * future caller to reach in and poke.
 */

import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { CameraTween } from '../../../@types/camera/CameraTween';
import type { TweenManager } from '../../../@types/camera/TweenManager';
import { advanceCameraTween } from '../../camera/cameraTween';

export function createTweenManager(deps: { readonly requestRender: () => void }): TweenManager {
  // The single tween reference, owned privately by this closure.  All
  // mutation goes through the methods below — no external caller can
  // reach this binding.
  let currentTween: CameraTween | null = null;

  function cancel(): void {
    currentTween = null;
  }

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the tween manager is one of the
  // engine's ~13 teardown targets, and the shared shape lets
  // engine.destroy() iterate uniformly across the bag.
  const manager: TweenManager = {
    start(tween: CameraTween): void {
      currentTween = tween;
      deps.requestRender();
    },
    cancel,
    isActive(): boolean {
      return currentTween !== null;
    },
    advance(cam: OrbitCamera, nowMs: number): boolean {
      if (currentTween === null) return false;
      const finished = advanceCameraTween(cam, currentTween, nowMs);
      if (finished) currentTween = null;
      return finished;
    },
    // destroy() simply funnels through cancel() — tearing down a
    // manager whose only owned state is the single tween reference IS
    // cancelling that tween.  Keeping `destroy` and `cancel` as
    // separate names preserves the existing call-site vocabulary
    // (pointerdown / SpaceMouse cancel a tween *without* destroying
    // the manager) while wiring into the uniform teardown contract.
    destroy(): void {
      cancel();
    },
  };
  manager satisfies Destroyable;
  return manager;
}
