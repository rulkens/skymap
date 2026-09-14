/**
 * EnuBoundsM — an axis-aligned box in a group's ENU metre frame (+X east,
 * +Y north, origin at the group anchor). Metres, so it can be compared
 * directly against baked geometry; the vertical axis is absent because the
 * floor prune it sits beside owns Z on its own terms.
 */
export type EnuBoundsM = {
  readonly minXM: number;
  readonly maxXM: number;
  readonly minYM: number;
  readonly maxYM: number;
};
