// ─── The enum itself ────────────────────────────────────────────────────────

/**
 * Stable numeric tag for every data source. Used as a `.bin` byte for
 * galaxy catalog rows, packed into the pick texture for galaxy catalog + structure hits, and
 * as a registry key for filament + volume assets.
 *
 * IMPORTANT: integer values 0..8 are persisted in the `.bin` point-cloud
 * file format AND packed into the pick texture's upper 5 bits. Treat
 * them like API version numbers — append, never renumber. Recycling a
 * code silently breaks every `.bin` ever written and every saved
 * selection URL.
 *
 * Codes ≥ 9 (filaments, volumes) are not persisted anywhere, but the
 * same "append, never renumber" discipline applies for consistency.
 */
export const Source = {
  /** Procedurally-generated stand-in cloud (no real photometry). */
  Synthetic: 0,
  /** Sloan Digital Sky Galaxy catalog — deep optical spectroscopic galaxy catalog. */
  SDSS: 1,
  /** 2MASS Redshift Galaxy catalog — near-IR all-sky redshift catalog. */
  TwoMRS: 2,
  /**
   * Galaxy List for the Advanced Detector Era (GLADE v2.3) — an all-sky
   * compilation that pre-merges HyperLEDA, GWGC, 2MASS XSC, 2MPZ, 6dFGS,
   * and SDSS-DR12Q with cross-match dedup. Acts as the "deep all-sky"
   * baseline so the merger doesn't have to re-dedup those parent catalogs.
   */
  Glade: 3,
  /**
   * Curated atlas of well-known galaxies (Messier + NGC greatest-hits).
   * Distinct from galaxy-catalog-derived sources because entries are hand-picked,
   * carry curated descriptions, and ship with high-quality processed
   * thumbnails. Many entries (M31, M33, M81, NGC 253) sit too close to
   * survive 2MRS/GLADE's small-z filtering, so they need their own
   * positions rather than just tagging existing rows.
   */
  FamousGalaxy: 4,
  /**
   * Galaxy-cluster anchors (Virgo, Coma, Norma, ...). Picks against a
   * cluster's marker ring return source code 5 in the upper 5 bits of
   * the packed identity; the 27-bit `localIdx` carries the structure's index
   * into the cluster table. See `selectionEncoding.ts` for the layout.
   */
  Cluster: 5,
  /** Supercluster anchors (Hydra Wall, Hercules SC, ...). Same encoding as Cluster. */
  Supercluster: 6,
  /** Void anchors (Sculptor Void, Local Void, Boötes Void). Same encoding as Cluster. */
  Void: 7,
  /**
   * Milliquas v8 (Flesch 2023) — the Million Quasars compilation. AGN
   * point sources (QSOs, BL Lacs, type-1 Seyferts, Seyfert-1 cores,
   * candidate quasars) rendered alongside the galaxy catalogs for the
   * optically-bright AGN sky. Slot 8 — slots 5/6/7 belong to the structure
   * codes above, so the next galaxy catalog integer is 8.
   */
  Milliquas: 8,
  /**
   * Cosmic-web filament skeleton (DisPerSE on a 2MRS + GLADE density
   * field). Single global asset, not per-record; the registry entry
   * carries the default-enabled flag + intensity multiplier.
   */
  Filaments: 9,
  /**
   * Cosmicflows-4 dark-matter density volume (Valade 2024 HAMLET cube,
   * 256³). Default-off scalar field; the registry entry carries its
   * presentation defaults (palette, contrast, exposure, …).
   */
  Cf4Density: 10,
  /**
   * MCPM ("Cosmic Slime" / rhizome) cosmic-web density volume — SDSS DR17
   * VAC, tier-aware. Default-on scalar field; the registry entry carries
   * its presentation defaults.
   */
  Mcpm: 11,
  /**
   * DEV-only synthetic Gaussian-blob volume — verifies "is anything
   * visible at the cube origin?". Procedurally generated; no on-disk
   * payload. Bundled out of production builds via `import.meta.env.DEV`
   * gating at the slot-registration site.
   */
  DebugGaussian: 12,
  /** DEV-only Cartesian-grid volume for axis-alignment verification. */
  DebugCartesian: 13,
  /** DEV-only spherical-shell-and-spoke volume for radial-symmetry verification. */
  DebugSpherical: 14,
  /**
   * Nearby galaxy-group anchors (Local Group, M81, Cen A, ...). Picks
   * against a group's marker ring return source code 15 in the upper 5
   * bits of the packed identity; the 27-bit `localIdx` carries the structure's
   * index into the structure store. Same encoding as Cluster/Supercluster/
   * Void. Seed-only (no bulk catalog), like Void. Appended at 15 — NEVER
   * renumber the galaxy catalog codes 0–8 below it.
   */
  Group: 15,
  /**
   * Procedural Milky-Way galactic-disk overlay. Registry-key-only code (not
   * persisted, not pickable); the entry carries the default-visible master
   * toggle. Appended at 16.
   */
  MilkyWay: 16,
  /**
   * CF4++ peculiar-velocity flow-field overlay (single `flowfield.scfd` cube,
   * demand-loaded). Registry-key-only code; the entry carries the default-off
   * gate plus the look/motion defaults. Appended at 17.
   */
  Flow: 17,
  /**
   * DESI DR1 deep-cone galaxy catalog — a narrow, ultra-deep pencil-beam
   * (BGS_BRIGHT + LRG + ELG_LOPnotqso + QSO tracers, NGC-only, Corona
   * Borealis cone) reaching z ≈ 3.5, far past every other galaxy catalog
   * source. Persisted to its own `.bin` like the other galaxy catalogs;
   * appended at 18 — never renumber the codes below it.
   */
  DesiDeep: 18,
  /**
   * DESI DR1 dec-band wedge galaxy catalog — a 2.5°-thick, 65°-long
   * declination-band fan (same four BGS/LRG/ELG/QSO tracers, NGC-only)
   * across the Corona Borealis arm of the DR1 footprint. A second drill
   * geometry through the same survey as the deep cone (see `DESI_PATCHES`);
   * persisted to its own `.bin`, appended at 19 — never renumber the codes
   * below it.
   */
  DesiWedge: 19,
  /**
   * DESI DR1 Sloan Great Wall galaxy catalog — the first DEPTH-bounded patch:
   * a bounded volume floating in space rather than the cone/wedge's infinite
   * drills, sculpted as a smooth union of ellipsoids on the wall's density
   * peaks (see `makeEllipsoidUnionFilter`) so the selection follows the wall's
   * true 3D extent with feathered, dissolved edges. Pure BGS by geometry
   * (LRG/ELG/QSO have nothing at z<0.1), so it carries real photometry. A third
   * drill geometry through the same survey (see `DESI_PATCHES`); persisted to
   * its own `.bin`, appended at 20 — never renumber the codes below it.
   */
  DesiSgw: 20,
  /**
   * Textured true-scale Earth in the near-field descent. Registry-key-only
   * code (not persisted, not pickable); the entry is a body row that renders
   * through its own content-layer, not the galaxy catalog points pipeline.
   * Appended at 23 — codes 21/22 are deliberately reserved for the Phase-3
   * `Star`/`Planet` body codes a later task appends, so the numbering stays
   * contiguous with those siblings. Never renumber the codes below it.
   */
  Earth: 23,
} as const;
