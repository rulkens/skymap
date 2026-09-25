/** `MeshBuildTarget.hole` — a georeferenced source's crop ring, already
 *  shifted onto its site's origin (same translation as the mesh itself), plus
 *  what `bakeTier` needs to convert the rasterised mask's ENU rect back to
 *  lat/lon: the site it's relative to, and the host's datum radius. */
export type HoleMaskTarget = {
  readonly ringM: readonly (readonly [number, number])[];
  readonly siteLatDeg: number;
  readonly siteLonDeg: number;
  readonly radiusM: number;
};
