/**
 * DESI_CONE — the ultra-deep-cone center, single source of truth for both
 * the build (`loadDesi` in `buildAllBins.ts`, which cone-filters the four
 * DESI DR1 LSS clustering FITS files down to the rows worth shipping) and
 * the `desi-cone-census` diagnostic (which re-checks whether a nearby
 * center would pack the cone denser).
 *
 * RA 231.85°, Dec +30.65°, radius 2.5° targets the Corona Borealis
 * supercluster. The center is a measured compromise between two candidates
 * that each fell short on their own:
 *
 * - The stored `corona-borealis-sc` seed anchor (RA 230.5005°, Dec +29.0°,
 *   `data/seeds/structure_anchors.seed.json`) is the supercluster's
 *   published position, but centering the cone exactly there runs into the
 *   DESI DR1 footprint edge — the south side of the beam falls outside
 *   survey coverage, roughly halving the row count.
 * - The DR1 density peak found by a live sampling spike across all eight
 *   tracer×cap files (RA 233.2°, Dec +32.3° — see
 *   `docs/superpowers/specs/2026-07-07-desi-deep-cone-design.md`) packs
 *   several rich Abell clusters (A2065, A2061, A2067, A2079) at
 *   z ≈ 0.07–0.11 densely into one line of sight, but sits far enough from
 *   the seed anchor that neither the anchor nor those clusters land inside
 *   the 2.5° beam.
 *
 * The midpoint of the seed→spike line keeps the anchor 2.0° off-axis
 * (inside the beam — the supercluster's own 35 Mpc radius spans ~7° at
 * 290 Mpc, so it envelops the beam regardless of exact centering) and
 * brings four classic CrB Abell clusters (A2061, A2067, A2079, A2092) into
 * the cone, at 77% of the density peak's row count (mild thinning at the
 * far southern rim, where the footprint edge still clips the cone).
 *
 * The center is deliberately isolated in its own module (rather than a
 * literal inside `buildAllBins.ts` or `desiConeCensus.ts`) so a future
 * re-center — the census diagnostic's whole reason for existing — is a
 * one-line edit in exactly one file, per the design spec's decision #4.
 */
import type { DesiTracer } from '../parsers/desiFits';

export const DESI_CONE = { raDeg: 231.85, decDeg: 30.65, radiusDeg: 2.5 } as const;

/**
 * Raw-data registry keys for the four DESI DR1 LSS clustering FITS files,
 * keyed by the same `DesiTracer` union `parseDesiClustering` accepts.
 *
 * Keyed by `DesiTracer` (not a flat array) so both the build (`loadDesi`) and
 * the census (`tallyTracer`) can look a file up straight from the tracer they
 * are iterating, with no name-to-key mapping step in between. The values are
 * dotted `rawDataRegistry` keys — every raw file goes through `rawDataPath`
 * rather than a hard-coded `data/raw/...` literal — so this is the one place
 * that pins the tracer→registry-key correspondence for both consumers.
 */
export type DesiTracerFileKey = 'desi.bgs' | 'desi.lrg' | 'desi.elg' | 'desi.qso';

export const DESI_TRACER_FILE_KEYS: Record<DesiTracer, DesiTracerFileKey> = {
  BGS: 'desi.bgs',
  LRG: 'desi.lrg',
  ELG: 'desi.elg',
  QSO: 'desi.qso',
};
