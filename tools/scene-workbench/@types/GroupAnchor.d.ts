/**
 * GroupAnchor — how a group's local metre frame maps onto the world.
 *
 * A one-member discriminated union on purpose: a future `scene` variant
 * (a position in skymap's universe frame, for groups not anchored to
 * Earth's surface) is a union case away, not a rewrite. Kept in full —
 * including `headingDeg` — though v1 only ever constructs it as 0.
 *
 * Frame: +X east, +Y north, +Z up at the anchor, before `headingDeg` — ENU.
 */
export type GroupAnchor = {
  readonly kind: 'geodetic';
  /** WGS84. */
  readonly latDeg: number;
  readonly lonDeg: number;
  /** Height above the DVR90 vertical datum, metres — DHM's own datum, no conversion. */
  readonly heightMDvr90: number;
  /** Rotation of the group's +X from local east, degrees CCW seen from above. */
  readonly headingDeg: number;
};
