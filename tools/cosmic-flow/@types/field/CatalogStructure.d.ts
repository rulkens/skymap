/**
 * CatalogStructure — one curated cosmic structure as catalogued, before placement.
 *
 * The raw label datum: a name plus its sky position (ICRS RA/Dec in degrees)
 * and a distance in PHYSICAL Mpc. Deliberately the observational quantities,
 * not world coordinates — turning these into the renderer's world cube is the
 * job of `structureWorld` (which applies the verified CF4++ box mapping). Kept
 * separate from `PlacedStructure` so the catalog is pure data anyone can read.
 */
export type CatalogStructure = {
  readonly name: string;
  readonly raDeg: number;
  readonly decDeg: number;
  /** Physical distance in Mpc (NOT Mpc/h — the box mapping applies h). */
  readonly distMpc: number;
};
