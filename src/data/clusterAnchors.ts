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
 * This matches the frame used by every GalaxyCatalog and the filament
 * binary, so anchor positions drop directly into world-space.
 *
 * Distances are best-effort consensus values from NED + simbad; small
 * (±10%) discrepancies are common in the literature and don't affect
 * the audit's pass/fail percentile.
 */

import type { Vec3 } from '../@types/math/Vec3';
import type { SkyCoord } from '../@types/data/SkyCoord';
import type { ClusterAnchor } from '../@types/data/ClusterAnchor';

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
export function raDecDistToEqCart(c: SkyCoord): Vec3 {
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

/**
 * Well-known supercluster centres — extended cosmic structures rather
 * than the dense cluster cores in `CLUSTER_ANCHORS`.  Each anchor
 * points at the supercluster's bulk-density peak rather than at a
 * single Abell cluster member, so the position is best-effort and
 * sourced from CF-4's own reconstruction peaks (see
 * `tools/verifyCf4Scfd.ts` for the methodology).
 *
 * Why a separate list: the cluster anchors above are tight, well-named
 * Abell-catalog members; superclusters span 50+ Mpc and don't have a
 * single textbook centre.  Splitting them keeps the cluster anchors
 * "ground truth" while leaving room for the more-interpretive
 * supercluster positions to be retuned without disturbing the audit.
 *
 * Listed by RA for stable iteration.
 */
export const SUPERCLUSTER_ANCHORS: readonly ClusterAnchor[] = [
  // Mid-distance density peak in the Hydra/Centaurus direction.  CF-4
  // shows a sustained 99.5th+ percentile blob at this location; the
  // closest named structure in the literature is the Hydra Wall, an
  // extension of the Hydra-Centaurus complex toward higher redshift.
  { name: 'Hydra Wall',               raHours: 13 + 17 / 60,             decDeg: -15,              distMpc: 152 },
  // Foreground core of the Hercules Supercluster (which extends from
  // ~110 to 200 Mpc and includes A2147 / A2151 / A2152).  The CF-4
  // peak sits in the supercluster's nearer wall, ~40 Mpc in front of
  // the named Hercules (A2151) cluster anchor.
  { name: 'Hercules SC',              raHours: 15 + 40 / 60,             decDeg:  16,              distMpc: 120 },
];

/**
 * Well-known voids inside CF-4's 500 Mpc box.  Distances + centres
 * are best-effort consensus values from the literature (Tully 2008
 * for Local Void; Kirshner 1981/1987 for Boötes; Sharp 1986 for
 * Sculptor) and are intentionally approximate — voids span tens of
 * Mpc and CF-4's Wiener-filter smoothing makes the centre a blob
 * rather than a point.
 *
 * Why a separate list (rather than a `category` field on
 * `ClusterAnchor`): keeps the cluster/supercluster anchors purely
 * positive — useful for the existing audit script which assumes the
 * cluster set should be overdense.  Consumers that want both render
 * each list with its appropriate `PoiCategory`.
 */
export const VOID_ANCHORS: readonly ClusterAnchor[] = [
  // Sculptor Void — local, just south of the celestial equator.
  { name: 'Sculptor Void',            raHours:  0,                       decDeg: -30,              distMpc:  35 },
  // Local Void — adjacent to the Local Group, mostly above the
  // galactic plane.  Tully 2008 places its centre near galactic
  // (l=37°, b=15°) → eq (RA≈18h 38m, Dec≈+18°) at ~25 Mpc.
  { name: 'Local Void',               raHours: 18 + 38 / 60,             decDeg:  18,              distMpc:  25 },
  // Boötes Void — the famous "Great Void" of Kirshner 1981; ~50 Mpc
  // radius centred at roughly (RA=14h 50m, Dec=+46°) at ~245 Mpc.
  // Near the edge of CF-4's reliable volume — don't over-interpret a
  // mismatch here.
  { name: 'Boötes Void',              raHours: 14 + 50 / 60,             decDeg:  46,              distMpc: 245 },
];
