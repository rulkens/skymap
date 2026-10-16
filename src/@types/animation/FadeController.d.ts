/**
 * FadeController — public surface of the pure-CPU per-id opacity
 * ramp primitive.
 *
 * Owns one (sourceOpacity, targetOpacity, transitionStartMs,
 * transitionDurationMs) tuple. `currentOpacity(now)` returns a
 * smoothstep between source and target, clamped after start + duration.
 * No GPU resources; the controller is a pure value the registry holds
 * one of per FadeIdentity.
 *
 * The factory + concrete implementation live in
 * `src/services/animation/fadeController.ts`.
 */

export type FadeController = {
  /**
   * Start a new fade. Reads `currentOpacity(now)` as the new
   * `sourceOpacity` (so mid-flight retargeting picks up smoothly from
   * wherever the previous fade reached), records the target + start.
   *
   * A call whose `target` already equals the held/heading-for target is a
   * no-op, so a re-sync of an unchanged intent can't restart an in-flight
   * fade.
   */
  fadeTo(target: number, durationMs: number, nowMs?: number): void;

  /**
   * Skip animation entirely. Sets sourceOpacity + targetOpacity to
   * `value` and zeros the transition so `currentOpacity()` returns
   * `value` immediately and `isAnimating()` returns false.
   *
   * Used at engine bootstrap to register always-on overlays at 1.0.
   */
  setImmediate(value: number): void;

  /**
   * The opacity at the given time. Returns the smoothstep-eased value
   * along the (sourceOpacity → targetOpacity) ramp, clamped after the
   * ramp completes.
   */
  currentOpacity(nowMs?: number): number;

  /** The value the ramp is heading for (or already holds) — time-independent. */
  targetOf(): number;

  /**
   * Whether the smoothstep ramp is still in progress at the given time.
   * False once `nowMs >= transitionStartMs + transitionDurationMs`,
   * or when sourceOpacity === targetOpacity (no animation pending).
   */
  isAnimating(nowMs?: number): boolean;
};
