/** Floor for `raycastTerrain`'s `closingRate` (dimensionless, `d|p|/dt`). Its job
 *  is the OUTBOUND leg: past a ray's tangent point the rate goes NEGATIVE, so
 *  `f/closingRate` is negative, `max(rawStep, MIN_STEP_M)` crawls a metre per
 *  sample, and the budget dies before reaching terrain that lies beyond. A
 *  positive floor keeps the step large there. (It is not a `0/0` guard: `f/0`
 *  is `Infinity`, which the step cap already clamps harmlessly.) */
export const RAYCAST_CLOSING_RATE_FLOOR = 1e-3;
