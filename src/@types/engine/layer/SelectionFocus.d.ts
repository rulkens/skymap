/**
 * How a kind is framed on arrival and ringed while selected, as data: the generic
 * `arrivalFraming` and `selectionHaloOf` read it over the row's `positionMpc` + `radiusMpc`.
 */
export type SelectionFocus = {
  /** Share of the screen height the object's diameter fills on arrival, at any FOV. */
  readonly arrivalSize: number;
  readonly minDistanceMpc?: number;
  readonly maxDistanceMpc?: number;
  /** A volume the camera flies into rather than past (`flyPath` skips its pass-by offset). */
  readonly flyInto: boolean;
  /** A ring of `radii × radiusMpc`, drawn in the named depth slab; null = no halo. */
  readonly ring: { readonly radii: number; readonly slab: 'near0' | 'cosmo' } | null;
};
