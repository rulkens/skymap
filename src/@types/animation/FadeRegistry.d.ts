/**
 * FadeRegistry — public surface of the engine subsystem owning every
 * layer's fade controller.
 *
 * Engine subsystem at `state.subsystems.fades`. Constructed eagerly at
 * engine bootstrap, before `wireSlots` seeds every identity through
 * `register(...)`. See `src/services/animation/fadeRegistry.ts` for the
 * concrete factory.
 *
 * Storage: `Map<string, FadeController>` keyed by `fadeIdentityKey`. Consumers don't
 * see the serialization — they always pass identities.
 */

import type { FadeIdentity } from './FadeIdentity';
import type { Destroyable } from '../rendering/Destroyable';

export type FadeRegistry = Destroyable & {
  /**
   * Human-readable identifier (`'fadeRegistry'`). Part of the shared
   * `Destroyable` contract via `Renderer.label`-style discipline.
   */
  readonly label: string;

  /**
   * Register an id with the given initial opacity. Idempotent — a
   * second `register` call with the same id is a no-op (the
   * existing controller is preserved). Initial opacity defaults to 0
   * (the loading-fade-in case).
   */
  register(id: FadeIdentity, initialOpacity?: number): void;

  /** Drop an id and its controller. */
  unregister(id: FadeIdentity): void;

  /**
   * Start (or retarget) the fade for an id. Forwards to the
   * controller's `fadeTo`. Returns the controller's Promise. Also wakes
   * the render scheduler — callers never follow up with `requestRender`.
   *
   * If the id is not registered, throws — a quiet no-op would hide bugs
   * where an id is fadeTo'd before its registration runs.
   *
   * `nowMs` is passed through to the controller's `fadeTo` so tests
   * can inject deterministic timestamps. When omitted, the fade starts
   * at the last `tick(nowMs)` frame time — event-driven starts quantize
   * to the frame clock rather than sampling `performance.now()`.
   */
  fadeTo(id: FadeIdentity, target: number, durationMs: number, nowMs?: number): Promise<void>;

  /** Forwards to the controller's `setImmediate`. Throws if unregistered. */
  setImmediate(id: FadeIdentity, value: number): void;

  /**
   * The value the id's ramp is heading for (or holds). `null` for an
   * unregistered id — never a spurious match against a real 0 or 1 target.
   */
  targetOf(id: FadeIdentity): number | null;

  /**
   * The opacity at the given time for the given id. Returns 1.0 for
   * unregistered ids — fail-safe so a renderer asking for an id
   * that hasn't finished registering draws at full opacity instead of
   * disappearing. `nowMs` defaults to the last ticked frame time.
   */
  opacityOf(id: FadeIdentity, nowMs?: number): number;

  /**
   * True iff any registered controller is still animating at the given
   * time. Used by the render-on-demand predicate in `runFrame.ts`.
   * `nowMs` defaults to the last ticked frame time.
   */
  isAnyAnimating(nowMs?: number): boolean;

  /**
   * Called once per frame from `runFrame`. Records `nowMs` as the
   * registry's default clock, then walks the controllers and fires any
   * due Promise resolutions. An argless tick re-reads the last stamped
   * time (a time-wise no-op).
   */
  tick(nowMs?: number): void;
};
