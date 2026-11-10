/**
 * Transitional alias table: each member's value is its source entry's id, so ids key every
 * registry, asset and ref. Never a pick code (`createPickCodeAllocator` allocates those).
 * Deleted once call sites name the ids directly.
 */
export const Source = {
  /** Sloan Digital Sky Survey galaxy catalog. */
  SDSS: 'sdss',
  /** 2MASS Redshift Survey galaxy catalog. */
  TwoMRS: '2mrs',
  /** GLADE v2.3: pre-merged HyperLEDA, GWGC, 2MASS XSC, 2MPZ, 6dFGS, SDSS-DR12Q with cross-match dedup. */
  Glade: 'glade',
  /** Hand-picked well-known galaxies; M31, M33, M81, NGC 253 are too near for 2MRS/GLADE's small-z filter, so they carry their own positions. */
  FamousGalaxy: 'famousGalaxy',
  /** Cluster anchors; a pick's 26-bit `localIdx` indexes the structure table (`selectionEncoding.ts`). */
  GalaxyCluster: 'galaxy-cluster',
  /** Supercluster anchors; same encoding as GalaxyCluster. */
  Supercluster: 'supercluster',
  /** Void anchors; same encoding as GalaxyCluster. */
  Void: 'void',
  /** Milliquas v8 (Flesch 2023) AGN point sources. */
  Milliquas: 'milliquas',
  /** Cosmic-web filament skeleton (DisPerSE): one global asset, registry key only. */
  Filaments: 'filaments',
  /** MCPM cosmic-web density volume (SDSS DR17 VAC), tier-aware. */
  Mcpm: 'mcpm',
  /** Nearby galaxy-group anchors; same encoding as GalaxyCluster, seed-only. */
  GalaxyGroup: 'galaxy-group',
  /** Procedural Milky-Way disk overlay; pickable via `milkyWayPickRenderer`. */
  MilkyWay: 'milkyWay',
  /** CF4++ peculiar-velocity flow field (`flowfield.scfd`); registry key only. */
  Flow: 'flow',
  /** DESI DR1 deep cone (Corona Borealis, NGC-only) to z ≈ 3.5; own `.bin`. */
  DesiDeep: 'desiDeep',
  /** DESI DR1 declination-band wedge (see `DESI_PATCHES`); own `.bin`. */
  DesiWedge: 'desiWedge',
  /** DESI DR1 Sloan Great Wall: depth-bounded ellipsoid union (`makeEllipsoidUnionFilter`), pure BGS; own `.bin`. */
  DesiSgw: 'desiSgw',
  /**
   * Curated nearby-star map; identity is the seed id, including the Sun's dot, since the star layers share one seed table.
   */
  FamousStar: 'famousStar',
  /** True-scale Solar-System bodies; pickable via `drawPick`, not persisted. */
  Planet: 'planet',
  /** Textured true-scale Earth; pickable via `drawPick`, not persisted. */
  Earth: 'earth',
  /** Survey-wide Gaia stars (tiered `stars-<tier>.bin`); leaf stars are pickable, identity is the record index. */
  GaiaStars: 'gaiaStars',
  /** True-3D constellation figures (`constellations.json`); registry key only. */
  Constellations: 'constellations',
  /** The Sun, its own row so the star map's gate stays a membership test. */
  Sun: 'sun',
  /** Sagittarius A\*: draws nothing. */
  SgrAStar: 'sgr-a-star',
  /** The 39 bound S-stars; their own seed table. */
  SStar: 'sStar',
  /** Zone-of-avoidance band; pickable. */
  ZoneOfAvoidance: 'zoneOfAvoidance',
  /** 2MRS Polyphorm density volume; registry key only, default-off test field. */
  Polyphorm2MRS: 'polyphorm-2mrs',
  /** MCPM workbench promoted-export volume (`tools/volumes/promoteWorkbenchExport.ts`); registry key only. */
  McpmWorkbench: 'mcpm-workbench',
  /** All missions-Layer craft under one code; the pick index runs over `MISSION_CRAFT_IDS`. */
  Craft: 'craft',
  /** Milky Way structure markers drawn by the NEAR0 marker pass; same encoding as GalaxyCluster, seed-only. */
  OpenCluster: 'open-cluster',
  GlobularCluster: 'globular-cluster',
  Nebula: 'nebula',
  GcCluster: 'gc-cluster',
  /** The satellites Layer's points; the pick index runs over the day's catalog. */
  Satellite: 'satellites',
  /** Vesta, Ceres and Bennu's label checkbox; they pick as `Planet` rows. */
  SmallBody: 'small-body',
} as const;
