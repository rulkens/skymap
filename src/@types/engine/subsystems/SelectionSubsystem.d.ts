import type { FocusableTarget } from '../FocusableTarget';

/**
 * SelectionSubsystem — a thin three-slot store over the engine's attention
 * ladder (hover → select → focus).  Each slot holds an already-resolved
 * `FocusableTarget` (GalaxyInfo | StructureInfo) or null; the subsystem does no
 * lookup of its own — callers resolve picks to targets before handing them in.
 */
export type SelectionSubsystem = {
  /** Currently-hovered target, or null. */
  hovered(): FocusableTarget | null;
  /** Currently-pinned (clicked) target, or null. */
  selected(): FocusableTarget | null;
  /**
   * Currently-focused (double-clicked / `focusOn`) target, or null.
   * The third attention rung above `selected`: drives the
   * cluster-focus member-isolation fade.  Independent of `selected`,
   * so deselecting does not drop focus — see the subsystem header.
   */
  focused(): FocusableTarget | null;
  /** Update the hover slot.  Fires `cb.onHoverChange` only on actual change. */
  setHovered(target: FocusableTarget | null): void;
  /** Update the selection slot.  Fires `cb.onSelectChange` only on actual change. */
  setSelected(target: FocusableTarget | null): void;
  /**
   * Update the focus slot.  Fires `cb.camera.onFocusChange` only on actual
   * change.  Symmetric with `setSelected`: the cluster-focus fade reads
   * `focused()` in `runFrame`, React mirrors the same target into the URL hash.
   */
  setFocused(target: FocusableTarget | null): void;
  /** Release internal state (no GPU resources to release). */
  destroy(): void;
};
