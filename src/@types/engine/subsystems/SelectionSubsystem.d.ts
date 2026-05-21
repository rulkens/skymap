import type { GalaxyInfo } from '../GalaxyInfo';
import type { Selection } from './Selection';

export type SelectionSubsystem = {
  /** Currently-hovered entity, or null. */
  hovered(): Selection | null;
  /** Currently-pinned (clicked) entity, or null. */
  selected(): Selection | null;
  /** Update the hover state.  Fires `cb.onHoverChange` only on actual change. */
  setHovered(sel: Selection | null): void;
  /**
   * Update the selection state.  Fires `cb.onSelectChange` only on
   * actual change.  Optional `prebuiltInfo` lets callers (e.g.
   * `selectByAlias`) pass the GalaxyInfo directly when the GPU upload
   * hasn't settled yet (the catalog is in `state.sources.catalogs` but the
   * renderer hasn't received it).  Ignored for POI selections.
   */
  setSelected(sel: Selection | null, prebuiltInfo?: GalaxyInfo | null): void;
  /** Release internal state (no GPU resources to release). */
  destroy(): void;
};
