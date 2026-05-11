/**
 * clusterAnchors — fixed table of well-known galaxy-cluster centres,
 * with a pure RA/Dec/distance → equatorial-Cartesian helper.
 *
 * ### Why a separate module?
 *
 * Two consumers need the same numbers:
 *
 *   1.  `tools/auditCf4Anchors.ts` — the one-off CF-4 sanity-check
 *       diagnostic that samples the density cube at each cluster's
 *       expected position.
 *
 *   2.  `services/engine/subsystems/poiSubsystem.ts` — the runtime
 *       label/marker overlay (behind `?anchors=1`) that lets the
 *       operator visually cross-reference the rendered cube against
 *       these same anchors.
 *
 * Keeping the table here means a future addition (or a distance
 * revision based on better catalog data) updates both call sites
 * atomically.
 *
 * ### Coordinate convention
 *
 * RA in HOURS (not degrees), Dec in DEGREES, distance in Mpc.  The
 * helper converts to equatorial Cartesian Mpc with the standard
 * right-handed convention: +X toward RA=0/Dec=0 (vernal equinox),
 * +Y toward RA=6h/Dec=0, +Z toward Dec=+90° (north celestial pole).
 * This matches the frame used by every PointCloud and the filament
 * binary, so anchor positions drop directly into world-space.
 *
 * Distances are best-effort consensus values from NED + simbad; small
 * (±10%) discrepancies are common in the literature and don't affect
 * the audit's pass/fail percentile.
 */

/** Right-ascension hours, declination degrees, distance in Mpc. */
export type SkyCoord = {
  readonly raHours: number;
  readonly decDeg: number;
  readonly distMpc: number;
};

/** A named cluster anchor — sky coord + display label. */
export type ClusterAnchor = SkyCoord & {
  readonly name: string;
};

/**
 * Convert (RA hours, Dec degrees, distance Mpc) → equatorial-Cartesian
 * Mpc.  Pure; no dependencies on any other module.
 *
 * Standard astronomical right-handed convention:
 *
 *     x = d · cos(RA) · cos(Dec)
 *     y = d · sin(RA) · cos(Dec)
 *     z = d · sin(Dec)
 *
 * where RA is converted from hours to radians via × 15° × π/180.
 */
export function raDecDistToEqCart(c: SkyCoord): readonly [number, number, number] {
  const RAD = Math.PI / 180;
  const ra = c.raHours * 15 * RAD;
  const dec = c.decDeg * RAD;
  const cd = Math.cos(dec);
  return [c.distMpc * Math.cos(ra) * cd, c.distMpc * Math.sin(ra) * cd, c.distMpc * Math.sin(dec)];
}

/**
 * The six well-known clusters spanning the CF-4 reliable-reconstruction
 * volume.  Listed roughly in increasing distance.
 *
 * Distances are luminosity-distance consensus values; small variations
 * across the literature (Coma sometimes 99, sometimes 102; Shapley
 * 180–220) don't materially shift the audit's percentile ranking.
 */
export const CLUSTER_ANCHORS: readonly ClusterAnchor[] = [
  { name: 'Virgo (M87)',              raHours: 12 + 30 / 60 + 49 / 3600, decDeg:  12 + 23 / 60,    distMpc:  16.5 },
  { name: 'Norma / Great Attractor',  raHours: 16 + 15 / 60,             decDeg: -(60 + 54 / 60),  distMpc:  70   },
  { name: 'Perseus (A426)',           raHours:  3 + 19 / 60 + 48 / 3600, decDeg:  41 + 31 / 60,    distMpc:  75   },
  { name: 'Coma (A1656)',             raHours: 12 + 59 / 60 + 49 / 3600, decDeg:  27 + 59 / 60,    distMpc: 100   },
  { name: 'Hercules (A2151)',         raHours: 16 +  5 / 60 + 15 / 3600, decDeg:  17 + 45 / 60,    distMpc: 158   },
  { name: 'Shapley (A3558)',          raHours: 13 + 27 / 60 + 57 / 3600, decDeg: -(31 + 30 / 60),  distMpc: 200   },
];
