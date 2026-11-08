/** AntiqueSheetAnchor — a fixed place on the plate, in print units from a corner, as a cartouche sits. */
export type AntiqueSheetAnchor = {
  readonly corner: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
  /** Centre offset from the corner, print units, measured inward. */
  readonly insetUnits: readonly [number, number];
  /** Width, print units. */
  readonly sizeUnits: number;
};
