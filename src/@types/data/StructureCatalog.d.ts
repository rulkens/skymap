/**
 * StructureCatalog — the runtime decoded shape of a `.ccat` binary file.
 *
 * Mirrors the SoA layout of `GalaxyCatalog`: separate typed arrays for each
 * field so the renderer can pass them straight to `device.queue.writeBuffer`
 * without per-record allocations or copy work.
 *
 * Why two radii?
 *
 *   `physicalRadiusMpc` — the structure's CORE extent (virial radius / R_200
 *   for clusters; the characteristic half-length for superclusters).  Drives
 *   the InfoCard's "r {value}" line and the camera-focus tween distance
 *   (how close the 'f' / Focus button parks the camera).
 *
 *   `apparentRadiusMpc` — the VISUAL/NAMED extent.  For clusters this is
 *   typically 2–3× the core radius, enclosing the wider membership the
 *   casual reader associates with the name.  For superclusters the
 *   distinction collapses (no virial core), so apparent ≈ physical.
 *   Drives the on-screen ring + halo half-extent.
 *
 * `significance` carries the raw physical mass proxy from each source
 * catalog (M500 in solar masses for MCXC cluster entries, N_m member count
 * for MSCC supercluster entries).  It is NOT normalised here — callers
 * that want a uniform [0,1] weight must normalise against the per-category
 * max after loading.
 *
 * `category` is a two-value byte:
 *   0 = cluster       (MCXC origin)
 *   1 = supercluster  (MSCC origin)
 * Higher values are reserved for a future void source and must be treated
 * as "unknown" by current consumers rather than crashed on.
 *
 * All distance / radius units are megaparsecs (Mpc).
 */

/** Cluster (0) vs. supercluster (1) marker; higher values reserved. */
export type StructureCategoryByte = 0 | 1;

/**
 * Cluster / supercluster catalog in renderer-ready layout — a struct of
 * arrays rather than an array of objects.  Parallel to `GalaxyCatalog`.
 */
export type StructureCatalog = {
  /** Number of structures. All typed arrays derive their length from this. */
  readonly count: number;

  /**
   * Interleaved xyz Cartesian positions in Mpc — length === count * 3.
   * Layout: [x0, y0, z0, x1, y1, z1, ...].
   * Equatorial-frame Cartesian, same convention as `GalaxyCatalog.positions`.
   */
  readonly positions: Float32Array;

  /**
   * Core / virial radius of each structure in Mpc — length === count.
   * See the module header for the distinction between physical and apparent.
   */
  readonly physicalRadiusMpc: Float32Array;

  /**
   * Visual / named extent of each structure in Mpc — length === count.
   * See the module header for the distinction between physical and apparent.
   */
  readonly apparentRadiusMpc: Float32Array;

  /**
   * Raw mass / richness proxy from the source catalog — length === count.
   * M500 (solar masses) for MCXC clusters; N_m member count for MSCC
   * superclusters.  Not normalised; consumers normalise per category.
   */
  readonly significance: Float32Array;

  /**
   * Category byte per structure — length === count.
   * 0 = cluster, 1 = supercluster; higher values reserved.
   */
  readonly category: Uint8Array;
};
