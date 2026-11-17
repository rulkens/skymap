/**
 * PickingSettings — the `picking` settings cluster: the selection kinds a view turns off for
 * scene clicks and hovers. A list of what is off, so a new kind is pickable everywhere until a
 * view names it, and no settings file lists every kind.
 */
export type PickingSettings = {
  /** Kind types (`SelectionKindRow.type`) a scene click or hover may not resolve. */
  readonly off: readonly string[];
};
