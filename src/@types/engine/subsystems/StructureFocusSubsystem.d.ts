import type { Destroyable } from '../../rendering/Destroyable';
import type { FocusSubject } from './FocusSubject';
import type { FocusFrame } from './FocusFrame';
import type { SelectionRefBase } from '../selection/SelectionRefBase';

/**
 * StructureFocusSubsystem — owns focus mode: when a receding row (`RecedingFocusRow`) is focused,
 * entries with `recession` dim over ~400 ms, and its sphere dims everything outside it (all of it,
 * for a stream). Every receding kind shares one blend; the sphere fades on a ramp of its own,
 * through 0 when the focus moves to a different sphere.
 *
 * ### Focus-driven, not imperative
 *
 * The selection subsystem's `focused()` slot is the single source of
 * truth ("a receding row is focused" *is* "focus active"). So instead of
 * scattering focusOn / clearFocus calls across every focus-mutating
 * site, this subsystem exposes one per-frame `update(subject, now)`
 * that diffs the subject's ref against the currently-active one and
 * drives the fade. No call sites to keep in sync.
 *
 * ### GPU re-derives membership
 *
 * The points vertex shader re-derives `distance(p.position, center) <
 * radius` per-vertex, so this subsystem never computes a CPU member list
 * — it only supplies center, radius, and the smoothstep blend. (The pure
 * `structureMembership` fn is the CPU count for the InfoCard row.)
 */
export type StructureFocusSubsystem = {
  readonly id: 'structureFocus';

  /**
   * Per-frame state sync. Diffs the subject's ref against the currently active one:
   *   - changed to a subject: latch it, fade toward 1 over 400 ms (a different sphere fades the
   *     shown one out first, then its own in).
   *   - changed to null: fade toward 0, keeping the last subject until blend settles at 0.
   *   - unchanged ref: no-op (no re-fade).
   *
   * Also wakes the render scheduler on any transition — callers never follow
   * up with `requestRender`.
   */
  update(subject: FocusSubject | null, nowMs: number): void;

  /**
   * Ticks the fade and returns this frame's focus, both blends scaled by `shownOf` the latched
   * ref: how shown its kind is this frame (0 = faded from view, so nothing recedes). At rest:
   * zero sphere, blend 0, no ref.
   */
  produceFocus(nowMs: number, shownOf: (ref: SelectionRefBase) => number): FocusFrame;

  /**
   * The value the last `produceFocus` returned, without ticking the fade: what a pick between
   * frames must test against, since it hit-tests the frame that was drawn. Its `ref` is not
   * `selection.focus`, which clears at the start of the fade-out.
   */
  lastFocus(): FocusFrame;

  /** True only while the fade is animating (drives render-on-demand). */
  isAwake(nowMs: number): boolean;
} & Destroyable;
