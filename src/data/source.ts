/**
 * Stable numeric tag for every data source: the registry key, the 6-bit source
 * field of a packed pick identity (`selectionEncoding.ts`, 63 is the sentinel),
 * and the bit position of the 32-bit galaxy visibility mask (`maskWith.ts`).
 *
 * NOT persisted: the SKMP record carries no source byte (one file per source)
 * and the URL hash uses string ids. Append-only all the same: the pick texture
 * and the mask assume a fixed code per row, and the mask wraps at 32. ADR 0014
 * replaces this enum (`docs/backlog/2026-10-19-mask-width-guard.md` is the
 * interim guard). Retired and unassigned: 0, 10, 12-14.
 */
export const Source = {
  /** Sloan Digital Sky Survey galaxy catalog. */
  SDSS: 1,
  /** 2MASS Redshift Survey galaxy catalog. */
  TwoMRS: 2,
  /** GLADE v2.3: pre-merged HyperLEDA, GWGC, 2MASS XSC, 2MPZ, 6dFGS, SDSS-DR12Q with cross-match dedup. */
  Glade: 3,
  /** Hand-picked well-known galaxies; M31, M33, M81, NGC 253 are too near for 2MRS/GLADE's small-z filter, so they carry their own positions. */
  FamousGalaxy: 4,
  /** Cluster anchors; a pick's 26-bit `localIdx` indexes the structure table (`selectionEncoding.ts`). */
  GalaxyCluster: 5,
  /** Supercluster anchors; same encoding as GalaxyCluster. */
  Supercluster: 6,
  /** Void anchors; same encoding as GalaxyCluster. */
  Void: 7,
  /** Milliquas v8 (Flesch 2023) AGN point sources. */
  Milliquas: 8,
  /** Cosmic-web filament skeleton (DisPerSE): one global asset, registry key only. */
  Filaments: 9,
  /** MCPM cosmic-web density volume (SDSS DR17 VAC), tier-aware. */
  Mcpm: 11,
  /** Nearby galaxy-group anchors; same encoding as GalaxyCluster, seed-only. */
  GalaxyGroup: 15,
  /** Procedural Milky-Way disk overlay; pickable via `milkyWayPickRenderer`. */
  MilkyWay: 16,
  /** CF4++ peculiar-velocity flow field (`flowfield.scfd`); registry key only. */
  Flow: 17,
  /** DESI DR1 deep cone (Corona Borealis, NGC-only) to z ≈ 3.5; own `.bin`. */
  DesiDeep: 18,
  /** DESI DR1 declination-band wedge (see `DESI_PATCHES`); own `.bin`. */
  DesiWedge: 19,
  /** DESI DR1 Sloan Great Wall: depth-bounded ellipsoid union (`makeEllipsoidUnionFilter`), pure BGS; own `.bin`. */
  DesiSgw: 20,
  /**
   * Curated nearby-star map. Not persisted (identity is the seed id) but pickable:
   * star layers stamp it via `drawPick`, including the Sun's dot, since they share one seed table.
   */
  FamousStar: 21,
  /** True-scale Solar-System bodies; pickable via `drawPick`, not persisted. */
  Planet: 22,
  /** Textured true-scale Earth; pickable via `drawPick`, not persisted. */
  Earth: 23,
  /** Survey-wide Gaia stars (tiered `stars-<tier>.bin`); leaf stars are pickable, identity is the record index. */
  GaiaStars: 24,
  /** True-3D constellation figures (`constellations.json`); registry key only. */
  Constellations: 25,
  /** The Sun, its own row so the star map's gate stays a membership test; its pick carries FamousStar (21), nothing stamps 26. */
  Sun: 26,
  /** Sagittarius A\*: draws nothing, never stamped into the pick texture. */
  SgrAStar: 27,
  /**
   * The 39 bound S-stars. Own code because the pick id indexes a seed table:
   * sharing FamousStar's would renumber every famous star.
   */
  SStar: 28,
  /** Zone-of-avoidance band; pickable. */
  ZoneOfAvoidance: 29,
  /** 2MRS Polyphorm density volume; registry key only, default-off test field. */
  Polyphorm2MRS: 30,
  /** MCPM workbench promoted-export volume (`tools/volumes/promoteWorkbenchExport.ts`); registry key only. */
  McpmWorkbench: 31,
  /** All missions-Layer craft under one code; the pick index runs over `MISSION_CRAFT_IDS`. */
  Craft: 32,
  /** Milky Way structure markers drawn by the NEAR0 marker pass; same encoding as GalaxyCluster, seed-only. Codes 38..62 remain. */
  OpenCluster: 33,
  GlobularCluster: 34,
  Nebula: 35,
  GcCluster: 36,
  /** The satellites Layer's points; the pick index runs over the day's catalog. */
  Satellite: 37,
} as const;
