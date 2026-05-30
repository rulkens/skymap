/**
 * clusterAnchors — fixed table of well-known galaxy-cluster centres.
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
 * `raDecDistToEqCart` helper (re-exported from
 * `src/utils/math/raDecDistToEqCart`) converts to equatorial Cartesian
 * Mpc with the standard right-handed convention: +X toward RA=0/Dec=0
 * (vernal equinox), +Y toward RA=6h/Dec=0, +Z toward Dec=+90° (north
 * celestial pole).  This matches the frame used by every GalaxyCatalog
 * and the filament binary, so anchor positions drop directly into
 * world-space.
 *
 * Distances are best-effort consensus values from NED + simbad; small
 * (±10%) discrepancies are common in the literature and don't affect
 * the audit's pass/fail percentile.
 */

import type { ClusterAnchor } from '../@types/data/ClusterAnchor';

export { raDecDistToEqCart } from '../utils/math/raDecDistToEqCart';

/**
 * Well-known clusters spanning the CF-4 reliable-reconstruction
 * volume.  Listed roughly in increasing distance.
 *
 * Two radii per anchor, with explicit semantic split:
 *
 *   `physicalRadiusMpc` — virial radius / R_200, the gravitationally-
 *     bound core.  Drives camera-focus tween distance and the InfoCard
 *     "r {value}" line (citable literature number).  Virgo's R_200 of
 *     ~2.2 Mpc does not enclose the M84/M86 subgroup; Coma's ~3 Mpc
 *     R_200 doesn't reach NGC 4889's outer envelope.  That's
 *     intentional for the cone-search membership astrophysics.
 *
 *   `apparentRadiusMpc` — wider "named" extent typically used in
 *     popular descriptions of the cluster.  Drives the on-screen ring
 *     + halo half-extent and the future galaxy-membership cone search
 *     (which galaxies count as "part of this cluster" for visual
 *     hide/show).  Sourced from outer-membership / X-ray envelope /
 *     "the cluster as people refer to it" literature where available;
 *     conservative round numbers where the literature is fuzzy.  See
 *     per-anchor comments.
 *
 * Distances are luminosity-distance consensus values; small variations
 * across the literature (Coma sometimes 99, sometimes 102; Shapley
 * 180–220) don't materially shift the audit's percentile ranking.
 */
export const CLUSTER_ANCHORS: readonly ClusterAnchor[] = [
  // Virgo: R_200 ~2.2 Mpc (Mei et al. 2007 SBF distance, Strauss &
  // Willick 1995 extent).  Named-extent ~6 Mpc: the "Virgo Cluster"
  // as popularly mapped includes the M84/M86 (Markarian Chain) and
  // M49 subgroups, spanning ~12° on the sky → ~3.4 Mpc projected,
  // with ~7 Mpc line-of-sight extent (Mei 2007).  6 Mpc is a
  // conservative envelope.
  { name: 'Virgo (M87)',              raHours: 12 + 30 / 60 + 49 / 3600, decDeg:  12 + 23 / 60,    distMpc:  16.5, physicalRadiusMpc: 2.2, apparentRadiusMpc: 6 },
  // Fornax (NGC 1399): R_200 ~1.4 Mpc.  Named-extent ~3 Mpc — the
  // Fornax Cluster region of Drinkwater et al. 2000 (PASA 17, 227)
  // maps the outer cluster + Fornax II group to ~3 Mpc.
  { name: 'Fornax (NGC 1399)',        raHours:  3 + 38 / 60 + 29 / 3600, decDeg: -(35 + 27 / 60),  distMpc:  20,   physicalRadiusMpc: 1.4, apparentRadiusMpc: 3 },
  // Hydra I (A1060): R_200 ~1.5 Mpc (Richter 1989).  Named-extent
  // ~3 Mpc covers the outer A1060 membership; the cluster sits in
  // a wider Hydra Wall filament structure that we capture separately
  // in SUPERCLUSTER_ANCHORS.
  { name: 'Hydra I (A1060)',          raHours: 10 + 36 / 60 + 43 / 3600, decDeg: -(27 + 31 / 60),  distMpc:  50,   physicalRadiusMpc: 1.5, apparentRadiusMpc: 3 },
  // Centaurus (A3526): R_200 ~1.6 Mpc (Lucey et al. 1986).  Named-
  // extent ~4 Mpc spans the Cen30 (NGC 4696) and Cen45 (NGC 4709)
  // subgroups together (Stein 1996, A&AS 116, 203) — the popular
  // "Centaurus Cluster" usually refers to this combined region.
  { name: 'Centaurus (A3526)',        raHours: 12 + 48 / 60 + 52 / 3600, decDeg: -(41 + 18 / 60),  distMpc:  52,   physicalRadiusMpc: 1.6, apparentRadiusMpc: 4 },
  // Norma / Great Attractor (Abell 3627): R_200 ~1.5 Mpc.  Named-
  // extent ~3 Mpc — Kraan-Korteweg et al. 1996 reconstruction places
  // the cluster's outer membership at ~2-3 Mpc through the Zone of
  // Avoidance.  Conservative given the ZoA obscuration.
  { name: 'Norma / Great Attractor',  raHours: 16 + 15 / 60,             decDeg: -(60 + 54 / 60),  distMpc:  70,   physicalRadiusMpc: 1.5, apparentRadiusMpc: 3 },
  // Perseus (A426): R_200 ~2.0 Mpc (Simionescu 2011).  Named-extent
  // ~5 Mpc — the X-ray emission extends well beyond R_200 (Walker
  // et al. 2012 ApJ 745, L21 maps it to ~2 R_200), and the Perseus
  // cluster region popularly includes the chain through NGC 1275.
  { name: 'Perseus (A426)',           raHours:  3 + 19 / 60 + 48 / 3600, decDeg:  41 + 31 / 60,    distMpc:  75,   physicalRadiusMpc: 2.0, apparentRadiusMpc: 5 },
  // Coma (A1656): R_200 ~3.0 Mpc (Kubo et al. 2007 weak-lensing).
  // Named-extent ~6 Mpc — includes the NGC 4839 southwest group
  // (Neumann et al. 2003 A&A 400, 811 show it's infalling at
  // ~2 Mpc projected) and the wider outer-membership halo Coma's
  // popular description reaches.
  { name: 'Coma (A1656)',             raHours: 12 + 59 / 60 + 49 / 3600, decDeg:  27 + 59 / 60,    distMpc: 100,   physicalRadiusMpc: 3.0, apparentRadiusMpc: 6 },
  // Abell 2199 (NGC 6166 BCG): R_200 ~2.0 Mpc.  Named-extent ~4 Mpc —
  // A2199 is part of the A2197/A2199 pair (Rines et al. 2001
  // ApJ 561, L41 measure the combined infall pattern to ~4 Mpc).
  // Markevitch 1999 covers the core; named region popularly includes
  // the wider pair.
  { name: 'A2199 (NGC 6166)',         raHours: 16 + 28 / 60 + 38 / 3600, decDeg:  39 + 33 / 60,    distMpc: 120,   physicalRadiusMpc: 2.0, apparentRadiusMpc: 4 },
  // Ophiuchus: R_200 ~2.0 Mpc (Watanabe 2001).  Named-extent ~4 Mpc.
  // Hot, X-ray luminous; X-ray envelope extends well past R_200 per
  // Million et al. 2010 (MNRAS 407, 2046).  ZoA-adjacent so the
  // outer membership is poorly constrained — conservative round.
  { name: 'Ophiuchus',                raHours: 17 + 12 / 60 + 25 / 3600, decDeg: -(23 + 22 / 60),  distMpc: 120,   physicalRadiusMpc: 2.0, apparentRadiusMpc: 4 },
  // Hercules (A2151): R_200 ~1.8 Mpc (Bird, Davis & Beers 1995).
  // Named-extent ~4 Mpc — Hercules is unrelaxed and substructured;
  // Sánchez-Janssen et al. 2005 (A&A 434, 521) map the irregular
  // membership envelope to ~3-4 Mpc.  Forms a triplet with A2147 +
  // A2152 (the broader Hercules SC, in the supercluster table).
  { name: 'Hercules (A2151)',         raHours: 16 +  5 / 60 + 15 / 3600, decDeg:  17 + 45 / 60,    distMpc: 158,   physicalRadiusMpc: 1.8, apparentRadiusMpc: 4 },
  // Shapley (A3558): R_200 ~2.5 Mpc of the central member cluster
  // (Reiprich & Böhringer 2002).  Named-extent ~5 Mpc covers the
  // wider A3558 outer-membership envelope; the much larger Shapley
  // *Concentration* (~40 Mpc, ~25 cluster members) lives in the
  // supercluster table.
  { name: 'Shapley (A3558)',          raHours: 13 + 27 / 60 + 57 / 3600, decDeg: -(31 + 30 / 60),  distMpc: 200,   physicalRadiusMpc: 2.5, apparentRadiusMpc: 5 },
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
// Superclusters and voids have no virial-core / R_200 concept — they're
// not bound, relaxed systems.  For those, `physicalRadiusMpc` and
// `apparentRadiusMpc` collapse to the same value: the literature
// "characteristic scale" IS the apparent extent.  We populate both
// fields with the same number so downstream code can read either
// without special-casing.
export const SUPERCLUSTER_ANCHORS: readonly ClusterAnchor[] = [
  // Laniakea Supercluster: the gravitational basin we live in.
  // Tully et al. 2014, Nature 513, 71 places the basin-of-attraction
  // centre near the Norma/Great-Attractor direction at ~80 Mpc; the
  // structure spans ~160 Mpc end-to-end so the radius is ~80 Mpc.
  // The "centre" is best understood as the divergence-zero point of
  // the local velocity field, not a galaxy concentration.
  { name: 'Laniakea SC',              raHours: 10 +  0 / 60,             decDeg: -(46 +  0 / 60),  distMpc:  80, physicalRadiusMpc: 80, apparentRadiusMpc: 80 },
  // Perseus-Pisces Supercluster: a prominent ~70 Mpc-long filament
  // across Perseus / Pisces / A262 / A347.  One of the textbook
  // examples of large-scale structure since Haynes & Giovanelli 1986,
  // ApJ 306, 466.  Centre is roughly between the foreground A262 and
  // background A426 (Perseus) — the named "supercluster" stretches
  // ahead of and beyond Perseus.
  { name: 'Perseus-Pisces SC',        raHours:  2 + 30 / 60,             decDeg:  38 +  0 / 60,    distMpc:  70, physicalRadiusMpc: 50, apparentRadiusMpc: 50 },
  // Coma Supercluster: ~30 Mpc-scale concentration around the Coma
  // (A1656) and Leo (A1367) clusters.  Smaller and denser than
  // Laniakea or Perseus-Pisces.  Gregory & Thompson 1978, ApJ 222,
  // 784 ("the Coma/A1367 supercluster").
  { name: 'Coma SC',                  raHours: 12 + 50 / 60,             decDeg:  28 +  0 / 60,    distMpc: 100, physicalRadiusMpc: 30, apparentRadiusMpc: 30 },
  // Mid-distance density peak in the Hydra/Centaurus direction.  CF-4
  // shows a sustained 99.5th+ percentile blob at this location; the
  // closest named structure in the literature is the Hydra Wall, an
  // extension of the Hydra-Centaurus complex toward higher redshift.
  // ~50 Mpc structural extent across the wall — CF-4 density peak is
  // broad, consistent with the wall's filamentary ~50 Mpc transverse
  // scale.
  { name: 'Hydra Wall',               raHours: 13 + 17 / 60,             decDeg: -15,              distMpc: 152, physicalRadiusMpc: 50, apparentRadiusMpc: 50 },
  // Foreground core of the Hercules Supercluster (which extends from
  // ~110 to 200 Mpc and includes A2147 / A2151 / A2152).  The CF-4
  // peak sits in the supercluster's nearer wall, ~40 Mpc in front of
  // the named Hercules (A2151) cluster anchor.  ~60 Mpc full-extent
  // radius spanning A2147 / A2151 / A2152.  Einasto et al. 2001,
  // AJ 122, 2222 puts the supercluster's characteristic scale at
  // 50-70 Mpc.
  { name: 'Hercules SC',              raHours: 15 + 40 / 60,             decDeg:  16,              distMpc: 120, physicalRadiusMpc: 60, apparentRadiusMpc: 60 },
  // Shapley Supercluster: the densest concentration of clusters in
  // the local universe, ~200 Mpc away in the Centaurus direction.
  // Wider than the A3558 core cluster (in the cluster table) — the
  // full Shapley Concentration spans ~40 Mpc with ~25 cluster members.
  // Quintana et al. 2000, AJ 120, 511.
  { name: 'Shapley SC',               raHours: 13 + 25 / 60,             decDeg: -(31 +  0 / 60),  distMpc: 195, physicalRadiusMpc: 40, apparentRadiusMpc: 40 },
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
// Voids have no core/extent distinction (they're not bound objects) —
// same convention as superclusters: physicalRadiusMpc == apparentRadiusMpc.
export const VOID_ANCHORS: readonly ClusterAnchor[] = [
  // Sculptor Void — local, just south of the celestial equator.
  // ~25 Mpc characteristic radius.  Sharp 1986, MNRAS 221, 137;
  // size approximate due to void-finding method sensitivity.
  { name: 'Sculptor Void',            raHours:  0,                       decDeg: -30,              distMpc:  35, physicalRadiusMpc: 25, apparentRadiusMpc: 25 },
  // Local Void — adjacent to the Local Group, mostly above the
  // galactic plane.  Tully 2008 places its centre near galactic
  // (l=37°, b=15°) → eq (RA≈18h 38m, Dec≈+18°) at ~25 Mpc.
  // ~30 Mpc radius. Tully et al. 2008, ApJ 676, 184; the void
  // extends asymmetrically, so this is the effective radius of the
  // equivalent sphere.
  { name: 'Local Void',               raHours: 18 + 38 / 60,             decDeg:  18,              distMpc:  25, physicalRadiusMpc: 30, apparentRadiusMpc: 30 },
  // Boötes Void — the famous "Great Void" of Kirshner 1981; ~50 Mpc
  // radius centred at roughly (RA=14h 50m, Dec=+46°) at ~245 Mpc.
  // Near the edge of CF-4's reliable volume — don't over-interpret a
  // mismatch here.  Kirshner et al. 1987, ApJ 314, 493 ("the Great
  // Void"). At ~245 Mpc distance the 50 Mpc radius subtends ~12° on
  // the sky.
  { name: 'Boötes Void',              raHours: 14 + 50 / 60,             decDeg:  46,              distMpc: 245, physicalRadiusMpc: 50, apparentRadiusMpc: 50 },
];
