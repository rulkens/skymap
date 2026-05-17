/**
 * FadeController — public surface of the pure-CPU per-handle opacity
 * ramp primitive.
 *
 * Owns one (sourceOpacity, targetOpacity, transitionStartMs,
 * transitionDurationMs) tuple. `currentOpacity(now)` returns a
 * smoothstep between source and target, clamped after start + duration.
 * No GPU resources; the controller is a pure value the registry holds
 * one of per FadeHandle.
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
   * Returns a Promise that resolves when `tick(now)` first observes
   * `!isAnimating(now)` — i.e. when the smoothstep saturates. The slot
   * orchestration code awaits this to sequence fade-out → upload →
   * fade-in.
   *
   * Calling `fadeTo` while a previous Promise is unresolved leaves the
   * earlier promise pending; it resolves at its original resolveMs
   * deadline (even though the controller has retargeted to a new
   * destination in the meantime). If a caller wants strict
   * cancel-on-retarget semantics, they should await the previous
   * fadeTo before issuing a new one.
   */
  fadeTo(target: number, durationMs: number, nowMs?: number): Promise<void>;

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

  /**
   * Whether the smoothstep ramp is still in progress at the given time.
   * False once `nowMs >= transitionStartMs + transitionDurationMs`,
   * or when sourceOpacity === targetOpacity (no animation pending).
   */
  isAnimating(nowMs?: number): boolean;

  /**
   * Resolve any pending fadeTo promises whose resolveMs has elapsed.
   * Called once per frame from the registry's tick. The registry
   * passes a single `nowMs` to every controller in the same tick so
   * `currentOpacity` and `tick` observe the same timestamp.
   */
  tick(nowMs: number): void;
};
