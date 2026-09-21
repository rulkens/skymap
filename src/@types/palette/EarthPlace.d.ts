/** A searchable Earth place with baked EOX satellite imagery at the point. */
export type EarthPlace = {
  id: string;
  /** Primary display name first, then searchable aliases. */
  names: readonly string[];
  lonDeg: number;
  latDeg: number;
  /** Camera altitude that frames the place on fly-to. */
  altKm: number;
};
