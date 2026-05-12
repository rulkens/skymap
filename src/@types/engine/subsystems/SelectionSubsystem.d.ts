import type { PointInfo } from '../PointInfo';
import type { SelectionInput } from './SelectionInput';

export type SelectionSubsystem = {
  /** Currently-hovered point, or null. */
  hovered(): SelectionInput | null;
  /** Currently-pinned (clicked) point, or null. */
  selected(): SelectionInput | null;
  /** Update the hover state.  Fires `cb.onHoverChange` only on actual change. */
  setHovered(sel: SelectionInput | null): void;
  /**
   * Update the selection state.  Fires `cb.onSelectChange` only on
   * actual change.  Optional `prebuiltInfo` lets callers (e.g.
   * `selectByAlias`) pass the PointInfo directly when the GPU upload
   * hasn't settled yet (the cloud is in `state.sources.clouds` but the
   * renderer hasn't received it).
   */
  setSelected(sel: SelectionInput | null, prebuiltInfo?: PointInfo | null): void;
  /**
   * Build the PointInfo for a (source, localIdx) tuple.  Returns null
   * if the cloud isn't loaded or the index is out-of-range.  Used both
   * internally (for the hover/select callback fan-out) and by callers
   * that want to look up a point without changing selection state.
   */
  pointInfoFor(sel: SelectionInput): PointInfo | null;
  /** Release internal state (no GPU resources to release). */
  destroy(): void;
};
