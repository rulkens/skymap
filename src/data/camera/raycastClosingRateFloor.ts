/** Floor for `raycastTerrain`'s `closingRate` (dimensionless, `d|p|/dt`). Guards
 *  the `f(t)/closingRate` step division from a `0/0` at an exact tangent point,
 *  not from precision loss — the outer step cap already bounds a near-zero
 *  closing rate's step size. */
export const RAYCAST_CLOSING_RATE_FLOOR = 1e-3;
