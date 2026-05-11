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
 * The manager is intentionally *passive* — it does not schedule
 * renders or call updatePosition itself.  The engine still owns the
 * scheduler wake-up after `start()` (via `scheduler.requestRender()`),
 * because the tween manager has no opinion about the engine's render
 * loop.  Keeping that coupling explicit at the call site means the
 * manager stays trivially testable without a render scheduler stub.
 *
 * ### Why a factory rather than a class?
 *
 * Matches the rest of the engine subsystems
 * (createRenderScheduler, createThumbnailSubsystem, …).  A factory
 * returning a typed handle keeps the internal `currentTween` reference
 * genuinely inaccessible — there is no `manager.currentTween` for a
 * future caller to reach in and poke.
 */

import type { Destroyable, OrbitCamera } from '../../../@types';
import { advanceCameraTween, type CameraTween } from '../../camera/cameraTween';

export type TweenManager = {
  /**
   * Start a new tween.  Replaces any running one (the previous tween
   * descriptor is GC'd; `cameraTween` is a frozen plan, not a stateful
   * object that needs disposal).
   */
  start(tween: CameraTween): void;
  /** Cancel the running tween, if any.  No-op when no tween is active. */
  cancel(): void;
  /** Whether a tween is currently in flight (drives the still-animating predicate). */
  isActive(): boolean;
  /**
   * Advance the running tween by one frame.  Mutates `cam` (target /
   * distance / yaw / pitch) and calls updatePosition internally; see
   * `advanceCameraTween` for the full per-frame contract.
   *
   * Returns `true` when the tween finished this frame — the manager
   * has already cleared its internal reference, so the caller does
   * not need to call `cancel()`.  The boolean is exposed in case the
   * caller wants to fire a one-shot side effect (e.g. log or wake an
   * adjacent subsystem) on completion; today's engine ignores it.
   *
   * No-op when no tween is active; returns `false`.
   */
  advance(cam: OrbitCamera, nowMs: number): boolean;
  /**
   * Tear down the manager.  Cancels any running tween and is otherwise
   * inert — there are no event listeners, workers, or timers to release.
   * Exists so the engine's bag of subsystems can be torn down uniformly
   * via the shared `Destroyable` shape (`engine.destroy()` iterates and
   * calls `destroy()` on each).
   */
  destroy(): void;
};

export function createTweenManager(): TweenManager {
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
