/**
 * FadeRegistry — public surface of the engine subsystem owning every
 * layer's fade controller.
 *
 * Engine subsystem at `state.subsystems.fades`. Constructed eagerly at
 * engine bootstrap, BEFORE any renderer (so renderer construction can
 * call `register(...)` without a null-check). See
 * `src/services/animation/fadeRegistry.ts` for the concrete factory.
 *
 * Storage: `Map<string, FadeController>` keyed by `serializeFadeHandle(h)`.
 * Consumers don't see the serialization — they always pass handles.
 */

import type { FadeHandle } from './FadeHandle';
import type { Destroyable } from '../rendering/Destroyable';

export type FadeRegistry = Destroyable & {
  /**
   * Human-readable identifier (`'fadeRegistry'`). Part of the shared
   * `Destroyable` contract via `Renderer.label`-style discipline.
   */
  readonly label: string;

  /**
   * Register a handle with the given initial opacity. Idempotent — a
   * second `register` call with the same handle is a no-op (the
   * existing controller is preserved). Initial opacity defaults to 0
   * (the loading-fade-in case).
   */
  register(handle: FadeHandle, initialOpacity?: number): void;

  /** Drop a handle and its controller. */
  unregister(handle: FadeHandle): void;

  /**
   * Start (or retarget) the fade for a handle. Forwards to the
   * controller's `fadeTo`. Returns the controller's Promise.
   *
   * If the handle is not registered, throws — slots and renderers
   * MUST register before fading, and a quiet no-op would hide bugs
   * where a handle is fadeTo'd before its registration runs.
   *
   * `durationMs` defaults to `FADE_IN_DURATION_MS` when target > current,
   * `FADE_OUT_DURATION_MS` otherwise — but callers are expected to pass
   * the duration explicitly for clarity at the call site. The default
   * is a fallback for tests and edge cases.
   *
   * `nowMs` is passed through to the controller's `fadeTo` so tests
   * can inject deterministic timestamps. Production callers omit it
   * and let `performance.now()` flow through.
   */
  fadeTo(handle: FadeHandle, target: number, durationMs?: number, nowMs?: number): Promise<void>;

  /** Forwards to the controller's `setImmediate`. Throws if unregistered. */
  setImmediate(handle: FadeHandle, value: number): void;

  /**
   * The opacity at the given time for the given handle. Returns 1.0 for
   * unregistered handles — fail-safe so a renderer asking for a handle
   * that hasn't finished registering draws at full opacity instead of
   * disappearing.
   */
  opacityOf(handle: FadeHandle, nowMs?: number): number;

  /**
   * True iff any registered controller is still animating at the given
   * time. Used by the render-on-demand predicate in `runFrame.ts`.
   */
  isAnyAnimating(nowMs?: number): boolean;

  /**
   * Called once per frame from `runFrame`. Walks the controllers and
   * fires any due Promise resolutions.
   */
  tick(nowMs?: number): void;
};
