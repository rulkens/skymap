/**
 * ClipOpacityChannel — the clip's transient opacity channel.
 *
 * A clip can fade individual visibility addresses independently of the
 * settings-driven fades in the shared FadeRegistry. This
 * channel holds one private FadeController per VisibilityAddress, created
 * lazily on the first `fadeTo` call for a key. Untouched layers report a
 * factor of 1 — they are fully visible by default, so the clip only needs
 * to declare exceptions.
 *
 * It is the last factor of the value core hands a consumer
 * (`resolveVisibilityOpacity`):
 *
 *   handed value = registry fade × clip factor
 *
 * Keeping it separate from the shared FadeRegistry (which the settings-driven
 * visibility sync owns) means the clip's transient fades vanish cleanly on
 * `reset()` without disturbing the persistent visibility state. This mirrors the pattern used by
 * `structureFocusSubsystem` — a private `createFadeController` outside the
 * registry — extended to one-per-key.
 *
 * `clipPlayer` owns and calls this channel; callers outside the player
 * read the factor via `clipPlayer.clipOpacityOf(layer, nowMs)`.
 */

import type { VisibilityAddress } from './VisibilityAddress';

export type ClipOpacityChannel = {
  /** Drive a transient fade on one layer (the `fade()` verb), animated or snapped. */
  fadeTo(key: VisibilityAddress, target: number, durationMs: number, nowMs?: number): void;
  /** The clip-opacity factor for a layer at `now` — default 1 (untouched layers). */
  factorOf(key: VisibilityAddress, nowMs?: number): number;
  /** Advance every controller's clock (called from clipPlayer.tick). */
  tick(nowMs: number): void;
  /** Whether any controller is mid-ramp (keeps the loop awake; mirrors structureFocus). */
  isAnimating(nowMs?: number): boolean;
  /** Reset ALL layers to factor 1 — clip-end Resource teardown. */
  reset(): void;
};
