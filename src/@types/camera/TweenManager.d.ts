/**
 * TweenManager — public facade for the engine's at-most-one in-flight
 * camera tween.
 *
 * Before this type existed the engine kept a single mutable
 * `let currentTween: CameraTween | null = null;` as a closure variable
 * mutated from five separate sites.  The manager collapses all of that
 * into a four-method facade plus the shared `Destroyable` teardown
 * latch.
 *
 * The factory and its rationale live in
 * `src/services/engine/camera/tweenManager.ts`.
 */

import type { CameraTween } from './CameraTween';
import type { OrbitCamera } from './OrbitCamera';

export type TweenManager = {
  /**
   * Start a new tween.  Replaces any running one (the previous tween
   * descriptor is GC'd; `cameraTween` is a frozen plan, not a stateful
   * object that needs disposal).
   * Also wakes the render scheduler — callers never follow up with `requestRender`.
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
