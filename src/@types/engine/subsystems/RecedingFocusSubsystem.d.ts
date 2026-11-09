import type { Destroyable } from '../../rendering/Destroyable';
import type { RecedingFocusRow } from '../selection/RecedingFocusRow';
import type { FocusFrame } from './FocusFrame';
import type { SelectionRefBase } from '../selection/SelectionRefBase';

/**
 * RecedingFocusSubsystem — owns focus mode: when a receding row (`RecedingFocusRow`) is focused,
 * entries with `recession` dim over ~400 ms, and its `focusRegion` dims everything outside it (all
 * of it, for `'subjectOnly'`). Every receding kind shares one blend; the region fades on a ramp of
 * its own, through 0 when the focus moves to a different region.
 *
 * ### Focus-driven, not imperative
 *
 * The selection subsystem's `focused()` slot is the single source of
 * truth ("a receding row is focused" *is* "focus active"). So instead of
 * scattering focusOn / clearFocus calls across every focus-mutating
 * site, this subsystem exposes one per-frame `update(ref, row, now)`
 * that diffs the focused ref against the currently-active one and
 * drives the fade. No call sites to keep in sync.
 *
 * ### GPU re-derives membership
 *
 * The points vertex shader re-derives `distance(p.position, center) <
 * radius` per-vertex, so this subsystem never computes a CPU member list
 * — it only supplies center, radius, and the smoothstep blend. (The pure
 * `structureMembership` fn is the CPU count for the InfoCard row.)
 */
export type RecedingFocusSubsystem = {
  readonly id: 'recedingFocus';

  /**
   * Per-frame state sync. Diffs the focused ref against the currently active one (a null `row`
   * counts as no focus):
   *   - changed to a ref: latch it, fade toward 1 over 400 ms (a different region fades the
   *     shown one out first, then its own in).
   *   - changed to null: fade toward 0, keeping the last ref and region until blend settles at 0.
   *   - unchanged ref: no-op (no re-fade).
   *
   * Also wakes the render scheduler on any transition — callers never follow
   * up with `requestRender`.
   */
  update(ref: SelectionRefBase | null, row: RecedingFocusRow | null, nowMs: number): void;

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
