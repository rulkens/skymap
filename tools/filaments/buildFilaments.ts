#!/usr/bin/env node
/**
 * buildFilaments — assemble the cosmic-web filament skeleton.
 *
 * Pipeline:
 *
 *   1. Read the user-selected subset of
 *      public/data/galaxy-catalog/v9/{sdss,2mrs,glade}.bin → merged xyz
 *      positions, filtered to D < MAX_DISTANCE_MPC.  By default we read
 *      2MRS + GLADE only and exclude SDSS — its wedge footprint
 *      dominates the density field at the survey edges and DisPerSE
 *      locks onto those boundaries instead of the cosmic web.
 *      The `--sources` flag overrides this default for diagnostic
 *      builds: e.g. `--sources sdss` produces an SDSS-only skeleton
 *      whose ridges should trace the wedge boundary, empirically
 *      confirming the wedge-pollution hypothesis before we commit more
 *      time to refinements of the merged pipeline.
 *      See `readMergedPositions` for the per-source filtering details.
 *   2. Write data/raw/<cachePrefix>.tsv (DisPerSE ASCII-survey format,
 *      header `px py pz` followed by one line per galaxy: `x y z`).
 *      The basename varies with `--sources` (e.g. `galaxies_2mrs+glade.tsv`
 *      vs `galaxies_sdss.tsv`) so per-build caches don't collide.
 *   3. Run DisPerSE: delaunay_3D → mse → skelconv (default 5σ
 *      persistence, 2 smoothing passes).  delaunay_3D is required because
 *      mse cannot operate on a raw point cloud — it needs the Delaunay
 *      simplicial complex + DTFE density field that delaunay_3D produces.
 *   4. Parse the resulting .NDskl, convert to FilamentCloud, encode FILA v1
 *   5. Write the configured `--output` path (default
 *      public/data/filament/v1/filaments.bin).
 *
 * CLI flags:
 *   --cut N        persistence cut in σ (default 5)
 *   --smooth N     skelconv smoothing passes (default 2)
 *   --sources csv  subset of {sdss, 2mrs, glade}, comma-separated
 *                  (default: 2mrs,glade — see SDSS-exclusion rationale
 *                  above; the default produces the canonical merged
 *                  cosmic-web skeleton).
 *   --output path  destination `.bin` path (default
 *                  public/data/filament/v1/filaments.bin).  Use a
 *                  non-default path for diagnostic builds so the
 *                  canonical filaments.bin isn't clobbered, e.g.:
 *                    --sources sdss --output public/data/filament/v1/filaments-sdss.bin
 *
 * Run order: must be after `npm run build-tiers` so the survey .bin
 * files exist on disk under `public/data/galaxy-catalog/v9/`.  The
 * orchestrator reads those instead of re-parsing the raw catalogues,
 * because by the time DisPerSE runs we already have the cross-matched,
 * deduped positions on disk and reusing them keeps this script from
 * depending on the (slow, GLADE-streaming) raw-catalogue path. A stale
 * `.bin` from before a format bump fails loudly (`FormatVersionError`,
 * caught in `readMergedPositions` and rethrown naming the ordering fix)
 * rather than silently misreading bytes.
 *
 * External requirements:
 *   - DisPerSE installed (`delaunay_3D`, `mse`, and `skelconv` on PATH).
 *     See README for build instructions; this script throws a friendly
 *     error if any binary is missing.  Note delaunay_3D is only built if
 *     CGAL was available at DisPerSE configure time.
 *   - ~16 GB RAM during the `mse` step (DisPerSE peaks high).
 *   - 6-12 hours wall time on a workstation for the merged catalogue.
 *
 * The `--cut` flag overrides the default 5σ persistence threshold (e.g.
 * `--cut 7` for a sparser, more conservative skeleton).  `--smooth N`
 * adjusts the number of skelconv smoothing passes.
 *
 * Why we shell out rather than wrap a library?  DisPerSE is a sizeable
 * C++ codebase with native dependencies (CFITSIO, optionally MPI); a
 * subprocess boundary is the only practical interface from Node.  We
 * trade one-shot wall time for zero install pain on the JS side.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourceType } from '../../src/@types/data/SourceType';
import { rawDataPath } from '../utils/io/rawDataRegistry';

import {
  decodeGalaxyCatalog,
  GALAXY_CATALOG_DATA_PREFIX,
} from '../../src/data/galaxyCatalog/galaxyCatalogFormat';
import { parseNDskl, skeletonToFilamentCloud } from '../parsers/ndskl';
import {
  encodeFilaments,
  FILAMENT_DATA_PREFIX,
} from '../../src/data/filament/filamentBinaryFormat';
import { FormatVersionError } from '../../src/data/formatVersionError';
import type { GalaxyCatalog } from '../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import { Source } from '../../src/data/sources';
import { galaxyCatalogFluxLimit } from '../../src/data/galaxyCatalog/galaxyCatalogFluxLimits';
import { absoluteFromApparent } from '../../src/utils/math/absoluteFromApparent';
import { dMaxFromAbsolute } from '../../src/utils/math/dMaxFromAbsolute';
import { mulberry32 } from '../../src/utils/random/mulberry32';
import { computeAngularWeights } from '../../src/services/engine/bake/computeAngularWeights';
import { gaussian } from '../utils/random/gaussian';

/**
 * Default persistence cut in σ.  Lower = more filaments accepted as
 * persistent ridges; higher = sparser, more conservative skeleton.
 *
 * 5σ (Sousbie 2011 original) is the canonical "robust spine" — visually
 * the cosmic web with its leaves stripped off, only the most persistent
 * ridges survive.  We default to 5σ because at the current input scale
 * (V_max + HEALPix-corrected 2MRS+GLADE, D ≤ 300 Mpc, ~1.6 M weighted
 * points) the 5σ skeleton produces longer continuous ridges through
 * cluster spines, reading as cleaner cosmic-web structure.  3σ (the
 * typical cosmology-paper choice — Tempel+ 2014 etc.) gives ~2× more
 * filaments but the lower-σ tendrils visually compete with the spine
 * for attention; user feedback was that 5σ "looks more like the cosmic
 * web".  2σ is dense, includes Poisson-noise ridges, useful only for
 * exploration.
 *
 * Override with `--cut N` on the CLI.  The slow Delaunay-tessellation
 * stage (`.NDnet`) is cached on disk and shared across cuts, so
 * iterating on this knob only re-runs `mse + skelconv` (minutes, not
 * hours).
 */
const DEFAULT_PERSISTENCE_CUT = 5;
const DEFAULT_SMOOTHING_PASSES = 2;

/**
 * Canonical CLI strings for the three surveys we accept as input.  These
 * are LOWERCASE shortnames (matching the ALL_SOURCE_FILES `key` field
 * below).  Kept as a tuple-typed const so TypeScript can infer the
 * `SourceKey` union exactly without a duplicate type declaration.
 */
const VALID_SOURCE_KEYS = ['sdss', '2mrs', 'glade'] as const;
export type SourceKey = (typeof VALID_SOURCE_KEYS)[number];

export type ParsedBuildFilamentsArgs = {
  cut: number;
  smooth: number;
  /**
   * Selected surveys, normalised to the alphabetical-sorted order from
   * `VALID_SOURCE_KEYS` ordering.  Sorted up front so the derived
   * `cachePrefix` is invariant under user argv ordering — see
   * `cachePrefix` doc below.
   */
  sources: SourceKey[];
  /**
   * Output `.bin` path (relative to repo root or absolute).  Defaults to
   * `public/data/filament/v1/filaments.bin` so the canonical merged
   * build is a zero-flag invocation.
   */
  outputPath: string;
  /**
   * Stable basename for cache files (TSV input + DisPerSE NDnet) derived
   * from the sorted `sources`.  Two builds with the same source set hit
   * the same cache regardless of argv ordering — `--sources sdss,2mrs`
   * and `--sources 2mrs,sdss` both produce `2mrs+sdss`.  Two builds with
   * DIFFERENT source sets get different prefixes so they never collide
   * on disk (the diagnostic SDSS-only build keeps its own ~1 GB NDnet
   * cache separate from the merged build's).
   */
  cachePrefix: string;
};

/**
 * Tiny argv parser.  We don't pull in a flags library because there are
 * a handful of flags and the cost of a dependency outweighs the benefit
 * of a hand-rolled loop.  Each `--flag` consumes the next argv slot as
 * its value; anything else is ignored.
 *
 * Flags:
 *   --cut N       persistence cut in σ (default 5)
 *   --smooth N    skelconv smoothing passes (default 2)
 *   --sources csv comma-separated subset of {sdss, 2mrs, glade}
 *                 (default: 2mrs,glade — preserves the canonical
 *                 SDSS-excluding merged build, see module header)
 *   --output path output `.bin` path (default public/data/filament/v1/filaments.bin)
 *
 * Why does this take `argv` as a parameter (instead of reading
 * `process.argv` directly)?  Tests construct argv arrays inline and call
 * this function directly — that's only possible if argv is an explicit
 * argument.  The default (`process.argv.slice(2)`) preserves the
 * production invocation path: `main()` calls `parseArgs()` with no
 * arguments and gets the CLI flags exactly as before.
 *
 * Validation strategy: invalid `--sources` tokens throw with a message
 * naming both the offending token and the legal choices.  Empty/missing
 * `--sources` values also throw — they are almost certainly a shell-
 * quoting mistake and silently falling back to the default merge would
 * mask that.
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedBuildFilamentsArgs {
  let cut = DEFAULT_PERSISTENCE_CUT;
  let smooth = DEFAULT_SMOOTHING_PASSES;
  // `undefined` lets us distinguish "user did not pass --sources" (use
  // the canonical merged default) from "user passed --sources <something>"
  // (validate strictly, no implicit fallback).
  let rawSources: string | undefined;
  let outputPath = `public/data/${FILAMENT_DATA_PREFIX}/filaments.bin`;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cut') cut = Number(argv[++i] ?? cut);
    else if (a === '--smooth') smooth = Number(argv[++i] ?? smooth);
    else if (a === '--sources') {
      // Capture the raw token even if it's missing/empty — the validator
      // below produces the friendly error.  Note `argv[++i]` advances
      // past the value slot regardless, so the next iteration sees the
      // following flag and not the (consumed) value.
      rawSources = argv[++i];
    } else if (a === '--output') outputPath = argv[++i] ?? outputPath;
  }

  // Default: 2MRS + GLADE merged build (SDSS deliberately excluded —
  // see module-header doc for the wedge-pollution rationale).  We
  // distinguish "flag never appeared" from "flag appeared with missing
  // value": the second case throws (almost certainly a shell-quoting
  // typo) rather than silently falling back to the default merge.
  const sawSourcesFlag = argv.includes('--sources');
  let sources: SourceKey[];
  if (!sawSourcesFlag) {
    sources = ['2mrs', 'glade'];
  } else {
    if (rawSources === undefined || rawSources === '') {
      throw new Error(
        '--sources requires a comma-separated list of source names ' +
          `(valid: ${VALID_SOURCE_KEYS.join(', ')}); got ${rawSources === undefined ? 'no value' : 'empty string'}.`,
      );
    }
    const tokens = rawSources.split(',').map((s) => s.trim());
    const validated: SourceKey[] = [];
    for (const tok of tokens) {
      if (!(VALID_SOURCE_KEYS as readonly string[]).includes(tok)) {
        throw new Error(
          `Unknown source token "${tok}" in --sources. ` +
            `Valid choices: ${VALID_SOURCE_KEYS.join(', ')}.`,
        );
      }
      validated.push(tok as SourceKey);
    }
    sources = validated;
  }

  // Sort + dedupe.  Sorting alphabetically (rather than by some other
  // canonical order) gives a deterministic cache filename without
  // privileging any survey: the prefix `2mrs+glade+sdss` reads the same
  // regardless of which survey the operator typed first.  Dedupe is
  // defensive — `--sources sdss,sdss` would otherwise double-count in
  // the prefix.
  const dedupedSorted = Array.from(new Set(sources)).sort();
  const cachePrefix = dedupedSorted.join('+');

  return { cut, smooth, sources: dedupedSorted, outputPath, cachePrefix };
}

/**
 * Probe the PATH for the DisPerSE binaries we need.  We invoke each with
 * `--help` because it exits 0 quickly and is portable across DisPerSE
 * versions (older builds don't honour `--version`).  We check BOTH `mse`
 * and `skelconv` up front: a partially-built install (e.g. mse linked
 * but skelconv's CFITSIO link failed) would otherwise sit through the
 * multi-hour mse run before crashing on the missing skelconv.  A missing
 * binary or any non-zero exit is treated as "not installed" and we fail
 * loudly with a pointer to the README so the operator knows what to fix.
 */
function checkDisperse(): void {
  // delaunay_3D, mse and skelconv all participate in the pipeline, so we
  // probe each one up front.  delaunay_3D in particular is *optional* in
  // the DisPerSE build (it requires CGAL); a CGAL-less install will have
  // mse/skelconv but not delaunay_3D, and the failure mode without an
  // up-front check is a confusing "command not found" buried under the
  // multi-second startup of the first stage.
  //
  // delaunay_3D (unlike the other two) prints usage and exits with status
  // 0 when called with no arguments, so we probe it that way; passing
  // `--help` would still work but is not what the binary documents.
  const probes: Array<readonly [string, string[]]> = [
    ['delaunay_3D', []],
    ['mse', ['--help']],
    ['skelconv', ['--help']],
  ];
  for (const [bin, args] of probes) {
    const r = spawnSync(bin, args, { encoding: 'utf8' });
    if (r.error || r.status !== 0) {
      process.stderr.write(
        `error: DisPerSE \`${bin}\` binary not found on PATH (or returned non-zero).\n` +
          'Install: see README "Filament skeleton" section.\n' +
          '         delaunay_3D requires CGAL at DisPerSE build time.\n',
      );
      process.exit(1);
    }
  }
}

/**
 * Read each survey's .bin from `public/data/` and concatenate the xyz
 * positions into one big Float32Array.  Missing files are treated as
 * non-fatal warnings — running with only SDSS available is a useful
 * intermediate state during development.
 *
 * Buffer→ArrayBuffer note: `readFileSync` returns a Node `Buffer`, whose
 * `.buffer` is the (possibly shared, possibly offset) underlying pool.
 * `decodeGalaxyCatalog` constructs a `DataView` over the buffer starting at
 * byte 0, so handing it the pool directly would mis-read every file.
 * We slice out a clean owned ArrayBuffer covering exactly this Buffer's
 * bytes before decoding.
 */
/**
 * Maximum distance (Mpc) from the world origin for a galaxy to be
 * eligible as DisPerSE input.  200 Mpc captures the Local Supercluster
 * (Virgo + the Great Attractor direction) and the leading edge of the
 * Sloan Great Wall sheet without dragging in SDSS-pencil-beam volumes
 * where survey selection effects dominate the density field.  Past
 * ~250 Mpc, 2MRS's K-magnitude completeness drops below the level
 * needed for honest density estimation, so DisPerSE's persistent
 * ridges out there reflect the survey's drop-off rather than real
 * cosmic structure.
 */
const MAX_DISTANCE_MPC = 300;

/**
 * Minimum distance (Mpc) — excludes the Local-Group / Local-Sheet
 * inner zone where cz → distance via cz/H0 breaks down.
 *
 * For nearby galaxies (D < ~5 Mpc) the observed line-of-sight velocity
 * is dominated by peculiar motion (gravitational infall toward Virgo,
 * Local Group dynamics, etc.) rather than the Hubble flow; cz/H0 then
 * produces near-zero or even negative pseudo-distances, smearing real
 * positions onto a tiny knot around the world origin.  M31's cz is
 * ≈−300 km/s; the LMC/SMC are ≈+280 km/s — both map to fractions of a
 * Mpc instead of their actual distances (770 kpc, 50 kpc).
 *
 * DisPerSE then identifies that ~83-galaxy near-origin knot as a
 * persistent hub and threads filaments outward from the Milky Way's
 * position — visually wrong, since we sit in the Local Void with no
 * real filament hub here.  Cutting at 5 Mpc removes the Local Group
 * and Local Sheet from the input without losing any cosmic-web
 * structure (the cosmic-web concept doesn't apply at < ~5 Mpc; that
 * scale is dominated by gravitational dynamics, not topology).
 */
const MIN_DISTANCE_MPC = 5;

/**
 * ── Malmquist V_max correction parameters ──────────────────────────────
 *
 * Why correction at all?
 * ----------------------
 * The 2MRS + GLADE input we feed to DisPerSE is *flux-limited*, not
 * volume-limited.  At 200 Mpc we only see the brightest galaxies; at
 * 5 Mpc we see all the way down to the dwarf end of the luminosity
 * function.  DisPerSE estimates density via DTFE on the raw point set,
 * so an un-weighted input produces a density field that falls off
 * radially purely as a selection effect — DisPerSE then locks onto
 * those radial gradients and emits filaments aligned with the Earth-
 * to-galaxy line-of-sight (visible as "radial stripe" artifacts in the
 * skeleton).
 *
 * Why duplicate points instead of pass weights to DisPerSE?
 * ---------------------------------------------------------
 * DTFE has no concept of per-point weight: it estimates density from
 * the volume of Delaunay tetrahedra around each vertex.  The honest
 * way to amplify a vertex's contribution is to insert more vertices
 * representing the population that vertex stands in for.  This is
 * Schmidt's 1968 1/V_max correction applied at sample-construction
 * time rather than at analysis time.
 *
 * Per-galaxy weight formula (uncapped) — for a galaxy detected at
 * (apparent magG, distance D) in a survey with flux limit m_lim:
 *
 *     M           = absoluteFromApparent(magG, D)
 *     d_max       = dMaxFromAbsolute(M, m_lim)
 *     weight_raw  = (D_REF / d_max)^3
 *     weight      = clamp(weight_raw, 1.0, WEIGHT_CAP)
 *
 * D_REF = MAX_DISTANCE_MPC = 200 — the volume we're actually
 * building over.  Galaxies whose d_max ≥ D_REF (intrinsically bright,
 * detectable everywhere we care about) get weight = 1: they need no
 * amplification.  Galaxies with d_max ≪ D_REF (intrinsically faint,
 * only detectable nearby) get amplified to represent the missing
 * population we'd see in the inner volume but can't detect at the
 * outer volume.
 *
 * WEIGHT_CAP — without a cap, raw weights blow up to hundreds for the
 * faintest galaxies (a dwarf detectable to 20 Mpc has raw weight =
 * (200/20)^3 = 1000).  Capping at 15 keeps the duplication factor
 * ≲ 15× while still amplifying the genuinely-faint population.  The
 * cap is empirical: 5–10 leaves residual radial bias visible; 30+
 * blows up the Delaunay runtime past the practical budget.  15 is
 * the sweet spot from internal experiments on the 2MRS+GLADE merge.
 *
 * NOT used: vMaxWeight from src/utils/math/vMaxWeight.ts.  That helper
 * is intentionally clipped to [0, 1] for visualisation (it only ever
 * dims a galaxy, never amplifies).  Here we need the inverse-volume
 * sense (amplifies faint galaxies), uncapped except by WEIGHT_CAP.
 */
const D_REF_MPC = MAX_DISTANCE_MPC;
const WEIGHT_CAP = 15;

/**
 * Gaussian position jitter (Mpc, 1σ) applied to each duplicated copy
 * after the original.  Two competing constraints:
 *
 *   - Floor: must be » floating-point precision so duplicate points
 *     don't collapse onto a single Delaunay vertex.  CGAL's exact
 *     predicates handle ties, but a true zero-volume tetrahedron is a
 *     degenerate input that can crash delaunay_3D or produce numerical
 *     artifacts in the DTFE field.
 *   - Ceiling: must be « cosmic-web filament thickness (~5–10 Mpc) so
 *     the jitter doesn't smear out the topology we're trying to detect.
 *
 * 0.5 Mpc sits comfortably in the middle: ~0.5% of the build's outer
 * radius, ~10× the average inter-galaxy spacing in dense regions, and
 * ~10× smaller than typical filament thickness.  Empirically this is
 * the value that produced clean DisPerSE skeletons on a small-N test.
 *
 * The ORIGINAL galaxy is emitted at (x, y, z) with no jitter — only
 * copies 2..N receive a Gaussian offset.  Otherwise even the
 * non-amplified case (weight ≈ 1) would drift the entire input cloud
 * by ~0.5 Mpc per build, which would make filaments unstable across
 * re-runs of the same input.
 */
const JITTER_SIGMA_MPC = 0.5;

/**
 * Seed for the duplication+jitter PRNG.  We use a seeded generator
 * (`mulberry32` from `src/utils/random/mulberry32`) so two runs over
 * the same input produce byte-identical output — important for
 * reproducibility (caching the Delaunay tessellation across `--cut`
 * sweeps assumes the same TSV) and for debugging (a flaky filament can
 * be re-investigated deterministically).  Seeding from `Math.random()`
 * or `Date.now()` would make every build a fresh dataset and break
 * those invariants.
 */
const JITTER_SEED = 1234;

/**
 * Source-tagged positions: one entry per surviving input galaxy after
 * the distance filter.  We carry magG and the source tag so the
 * downstream Malmquist pass can look up the right per-survey flux
 * limit (m_lim varies by band: K_s = 11.75 for 2MRS, B = 18.0 for
 * GLADE).  Distance is recomputed from xyz on demand by the consumer
 * to avoid storing a redundant scalar.
 *
 * Why a single struct-of-arrays rather than two separate arrays?
 * The Malmquist pass walks all galaxies in lockstep regardless of
 * source — interleaving doesn't help cache locality at this scale
 * (~3M floats fit comfortably in modern L3) and a single shared array
 * keeps the code linear instead of branching per source.
 */
type TaggedPositions = {
  count: number;
  /** Interleaved xyz triples: positions[i*3 + {0,1,2}] in Mpc. */
  positions: Float32Array;
  /** Apparent magnitude in the survey's flux-limit band. */
  magG: Float32Array;
  /** Per-galaxy source tag (one of Source.TwoMRS, Source.Glade). */
  sources: Uint8Array;
  /**
   * Per-galaxy HEALPix angular re-weight in [1, WEIGHT_CAP].
   *
   * Computed per-source on the FULL un-filtered cloud (so 2MRS's
   * Galactic-plane zone of avoidance and GLADE's mixed-parent footprint
   * each get their own correction without cross-contamination — see
   * `computeAngularWeights` "Why per-survey, never global" rationale),
   * then indexed by the original cloud row at filter time so each
   * surviving galaxy carries its own pre-computed correction factor.
   *
   * Bounded at [1, WEIGHT_CAP] (not the visualisation default [0.3, 1.2])
   * because point duplication can only amplify (integer copies ≥ 1) —
   * dimming below 1× is impossible.  The cap matches V_max's
   * `WEIGHT_CAP` so the combined product `vmax × angular` capped at
   * `WEIGHT_CAP` keeps the duplication budget under control.
   */
  angularWeights: Float32Array;
};

/**
 * Master list of survey `.bin` files this orchestrator knows how to
 * read.  Each entry pairs the on-disk filename with the `Source` enum
 * value used downstream (for HEALPix angular weights and galaxyCatalogFluxLimit
 * lookups) and the lowercase canonical CLI key the `--sources` flag
 * accepts.  Adding a fourth survey would mean appending one row here
 * plus extending `VALID_SOURCE_KEYS` and `SourceKey`.
 *
 * Why an "ALL" list with runtime filtering rather than separate
 * functions per build?  The non-source-dependent stages (HEALPix
 * binning, distance filter, V_max correction, TSV write) are identical
 * across builds — only the input set differs.  Centralising the source
 * registry here keeps the per-source diagnostic build a one-line
 * filter rather than a parallel code path.
 */
const ALL_SOURCE_FILES = [
  { name: 'sdss.bin', source: Source.SDSS, key: 'sdss' as const },
  { name: '2mrs.bin', source: Source.TwoMRS, key: '2mrs' as const },
  { name: 'glade.bin', source: Source.Glade, key: 'glade' as const },
] as const;

/**
 * Read each catalogue's `.bin` selected by `activeSources`, merge into a
 * single Float32Array of xyz triples, filter to `MAX_DISTANCE_MPC`.
 *
 * **The default merged build excludes SDSS.** The SDSS wedge footprint
 * (~9000 deg² out of 41253) is the dominant artefact source for the
 * default build: DisPerSE locks onto the wedge boundaries because the
 * density field has a sharp step at the survey edge.  2MRS (all-sky,
 * K < 11.75) and GLADE (all-sky-ish union of 2MASS, HyperLEDA, GWGC,
 * SDSS) give a much cleaner all-sky density field for the cosmic-web
 * skeleton task even though SDSS dominates the catalogue by raw count.
 *
 * `activeSources` lets the operator override that default for
 * **diagnostic** builds.  In particular `--sources sdss` produces an
 * SDSS-only skeleton whose ridges are expected to trace the wedge
 * boundary — empirical confirmation of the wedge-pollution hypothesis
 * before we invest more time in mitigations.  Such builds are NOT for
 * runtime; they exist to be inspected by the human reviewing the
 * filament-generation pipeline.
 *
 * Distance gating is *euclidean* against the world origin (Earth/Sun
 * position in skymap world coords).  Galaxies are stored in cz/H0
 * comoving Mpc which is a fine approximation to true distance at
 * redshifts ≪ 1; refining to a luminosity / angular-diameter
 * distance is unnecessary at this scale (cz < 14000 km/s for the
 * 200 Mpc cut).
 */
function readMergedPositions(activeSources: ReadonlySet<SourceKey>): TaggedPositions {
  // Per-source: which `.bin` to read, and which Source enum value to
  // tag every surviving galaxy with.  The tag drives the right
  // galaxyCatalogFluxLimit() lookup in the Malmquist pass — m_lim is in the
  // K_s band for 2MRS (11.75), B band for GLADE (18.0), r band for
  // SDSS (17.77).  Mixing them up would silently mis-amplify entire
  // surveys.
  //
  // CLAUDE.md note on the 2MRS J/K mismatch: the parser puts J → magG
  // even though galaxyCatalogFluxLimit(2MRS) is documented as the K-band
  // limit.  This is a pre-existing inconsistency in the project
  // (render-time vMaxWeight inherits the same convention).  We don't
  // fix it here — matching the existing convention keeps build-time
  // and render-time Malmquist treatments consistent.
  const sourceFiles = ALL_SOURCE_FILES.filter((s) => activeSources.has(s.key));

  type LoadedCloud = { cloud: GalaxyCatalog; source: SourceType; angular: Float32Array };
  const loaded: LoadedCloud[] = [];
  for (const { name, source } of sourceFiles) {
    // `name` is the bare, un-tiered filename (`sdss.bin`/`glade.bin` are
    // pre-tier legacy artefacts `buildAllBins` no longer writes; only
    // `2mrs.bin` — tier-agnostic — actually exists here). Pre-existing,
    // out of scope: only the directory gets the epoch prefix.
    const path = resolve('public/data', GALAXY_CATALOG_DATA_PREFIX, name);
    if (!existsSync(path)) {
      process.stderr.write(`warning: ${path} not found — skipping\n`);
      continue;
    }
    const buf = readFileSync(path);
    // Slice yields a fresh ArrayBuffer with byteOffset=0 and the exact
    // file length, sidestepping the pooled-Buffer offset gotcha noted
    // above.
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    let cloud: GalaxyCatalog;
    try {
      cloud = decodeGalaxyCatalog(ab);
    } catch (err) {
      if (err instanceof FormatVersionError) {
        throw new Error(
          `${path} is format v${err.found}, this build reads v${err.expected} — ` +
            `run "npm run build-tiers" before "npm run build-filaments"`,
        );
      }
      throw err;
    }

    // Compute the HEALPix angular re-weight on the FULL cloud BEFORE
    // distance-filtering.  Two reasons this has to happen here, not later:
    //
    // 1. Per-source binning: 2MRS's all-sky-minus-Galactic-plane footprint
    //    and GLADE's mixed-parent-survey footprint produce DIFFERENT
    //    angular completeness patterns.  Mixing them in a global bin
    //    would let SDSS's wedge contaminate GLADE's correction (and
    //    vice-versa) — exactly the failure mode `computeAngularWeights`
    //    documents in its "Why per-survey, never global" section.
    // 2. Per-shell median: the algorithm's reference density is the
    //    median populated-cell count within each (shell) ring.  If we
    //    pre-filtered to D ∈ [5, 200] Mpc the inner/outer shells would
    //    be truncated and the medians at the boundaries would be wrong.
    //    Computing on the full cloud gets honest per-shell references,
    //    then we look up the angular weight for each surviving galaxy
    //    by its original cloud-row index during filtering.
    //
    // Bounds [1.0, WEIGHT_CAP] override the visualisation defaults
    // [0.3, 1.2]: point duplication can only amplify (integer copies
    // ≥ 1), so values < 1 are meaningless here, and the cap is raised
    // to match V_max's `WEIGHT_CAP` so the combined `vmax × angular`
    // weight (also capped at `WEIGHT_CAP` downstream) doesn't lose
    // headroom for genuinely under-detected sky cells.
    const angular = computeAngularWeights({
      cloud,
      source,
      weightMin: 1.0,
      weightMax: WEIGHT_CAP,
    });
    loaded.push({ cloud, source, angular });
  }

  // First pass: allocate to the worst-case bound (unfiltered total)
  // and fill with the inner+outer distance-filter survivors.  Slicing
  // at the end trims the trailing unused slots — DisPerSE would
  // otherwise treat a zero-padded (0, 0, 0) tail as legitimate
  // origin-clustered points.
  const distSqMin = MIN_DISTANCE_MPC * MIN_DISTANCE_MPC;
  const distSqMax = MAX_DISTANCE_MPC * MAX_DISTANCE_MPC;
  const totalRaw = loaded.reduce((acc, l) => acc + l.cloud.count, 0);
  const positions = new Float32Array(totalRaw * 3);
  const magG = new Float32Array(totalRaw);
  const sources = new Uint8Array(totalRaw);
  const angularWeights = new Float32Array(totalRaw);
  let kept = 0;
  for (const { cloud, source, angular } of loaded) {
    for (let i = 0; i < cloud.count; i++) {
      const x = cloud.positions[i * 3 + 0]!;
      const y = cloud.positions[i * 3 + 1]!;
      const z = cloud.positions[i * 3 + 2]!;
      const r2 = x * x + y * y + z * z;
      if (r2 < distSqMin || r2 > distSqMax) continue;
      positions[kept * 3 + 0] = x;
      positions[kept * 3 + 1] = y;
      positions[kept * 3 + 2] = z;
      magG[kept] = cloud.magG[i]!;
      sources[kept] = source;
      // Pull the angular weight by ORIGINAL cloud row index — `i` here
      // is the un-filtered position in the source cloud, which is
      // exactly what `computeAngularWeights` indexes by.
      angularWeights[kept] = angular[i]!;
      kept += 1;
    }
  }
  process.stderr.write(
    `  filtered ${totalRaw.toLocaleString()} → ${kept.toLocaleString()} ` +
      `(${MIN_DISTANCE_MPC} Mpc < D < ${MAX_DISTANCE_MPC} Mpc)\n`,
  );
  return {
    count: kept,
    positions: positions.slice(0, kept * 3),
    magG: magG.slice(0, kept),
    sources: sources.slice(0, kept),
    angularWeights: angularWeights.slice(0, kept),
  };
}

/**
 * Apply the combined Malmquist V_max + HEALPix angular re-weight
 * correction by duplicating each galaxy `floor(combined_weight)` times
 * (plus a stochastic fractional copy) and scattering each duplicate by
 * a Gaussian jitter of σ = 0.5 Mpc.
 *
 * Two complementary corrections, multiplied together
 * --------------------------------------------------
 * V_max corrects RADIAL completeness: a flux-limited survey only sees
 * intrinsically-faint galaxies nearby, so we duplicate them by
 * (D_REF / d_max)^3 to represent the population we'd see at this
 * distance if the survey were volume-limited.
 *
 * HEALPix angular re-weight corrects ANGULAR completeness: 2MRS's
 * Galactic-plane zone of avoidance and GLADE's mixed-parent footprint
 * leave some sky cells under-detected.  We measure the under-detection
 * via the per-shell median populated-cell count (see
 * `computeAngularWeights`) and amplify galaxies in under-dense cells
 * accordingly.  Bounded at [1, WEIGHT_CAP] for build-time use — point
 * duplication can't dim below 1×.
 *
 * Both corrections amplify by point duplication, so they compose
 * multiplicatively: a galaxy that's both intrinsically faint AND in a
 * sparse sky cell deserves the product of the two amplifications.  The
 * combined weight is capped at WEIGHT_CAP to keep the duplication
 * budget bounded — without the cap, a faint galaxy in the deepest
 * shell of an under-detected cell would balloon into hundreds of
 * copies and dominate the Delaunay tessellation locally.
 *
 * Algorithm per galaxy:
 *   1. Recompute distance D from xyz (we discarded D after filtering).
 *   2. M         = absoluteFromApparent(magG, D)
 *      d_max     = dMaxFromAbsolute(M, m_lim_for_source)
 *      vmax_raw  = (D_REF / d_max)^3
 *      angular   = pre-computed per-galaxy HEALPix weight in [1, WEIGHT_CAP]
 *      combined  = clamp(vmax_raw * angular, 1.0, WEIGHT_CAP)
 *      Bail-out: if d_max is non-finite or non-positive (e.g. magG is
 *      NaN), use vmax_raw = 1 — the angular factor still applies, so the
 *      galaxy still gets HEALPix amplification even when its photometry
 *      is missing.
 *   3. integer_copies = floor(combined)
 *      fractional     = combined - integer_copies
 *      if rng() < fractional: integer_copies += 1
 *      → over many galaxies the long-run mean matches the continuous
 *        weight (1.3 → averages 1.3 copies, not floor(1.3) = 1).
 *   4. Emit copy 1 at the original (x, y, z) with NO jitter — keeps
 *      the un-amplified case (combined ≈ 1) byte-identical to the
 *      pre-correction build for that galaxy.  Emit copies 2..N with
 *      Gaussian (σ = JITTER_SIGMA_MPC) offsets per axis.
 *
 * Out of scope:
 *   - Schechter density correction (different mechanic — corrects
 *     for the LF integral below the flux limit, not the population
 *     above it that V_max amplifies).
 */
function applyMalmquistDuplication(input: TaggedPositions): Float32Array {
  const rng = mulberry32(JITTER_SEED);

  // Two-pass approach.  Pass 1 computes per-galaxy weights and
  // accumulates the integer + stochastic copy count, sizing the output
  // buffer exactly.  Pass 2 fills the output in a separate loop using
  // the same RNG state continuation — this keeps the seeded
  // determinism intact (Mulberry32 advances are total-order across the
  // whole pass) and avoids growing a Float32Array dynamically.  For
  // ~3M galaxies the per-galaxy cost is one log/pow/cube/clamp +
  // bounded Box-Muller calls, all negligible compared to disk I/O.
  //
  // Why not allocate worst-case (count × WEIGHT_CAP × 3) and slice?
  // count ≈ 2M, WEIGHT_CAP = 15: that's a 360 MB peak allocation
  // before slicing back to ~50 MB.  V8 won't refuse it but the spike
  // is wasteful when a deterministic two-pass count gets the exact
  // size in microseconds.
  let totalCopies = 0;
  // Mirror buffer for V_max-only weight, used solely to compute the
  // diagnostic `vmaxOnlyMean` for the log line below.  Keeping this
  // alongside the combined weight (rather than recomputing later) is
  // cheap (~8 MB at full GLADE) and avoids a second pass.
  const perGalaxyWeight = new Float32Array(input.count);
  const perGalaxyVmaxOnly = new Float32Array(input.count);
  for (let i = 0; i < input.count; i++) {
    const x = input.positions[i * 3 + 0]!;
    const y = input.positions[i * 3 + 1]!;
    const z = input.positions[i * 3 + 2]!;
    const D = Math.sqrt(x * x + y * y + z * z);
    const magG = input.magG[i]!;
    const mLim = galaxyCatalogFluxLimit(input.sources[i]! as SourceType);

    // Compute the uncapped V_max raw weight first.  Bail safely to
    // raw = 1 if any input is NaN/inf (e.g. a galaxy with missing
    // photometry) — the galaxy still contributes itself, and the
    // angular factor still applies on top.
    let vmaxRaw = 1;
    const absMag = absoluteFromApparent(magG, D);
    if (Number.isFinite(absMag)) {
      const dMax = dMaxFromAbsolute(absMag, mLim);
      if (Number.isFinite(dMax) && dMax > 0) {
        vmaxRaw = (D_REF_MPC / dMax) ** 3;
      }
    }
    // V_max-only diagnostic, capped to the same bounds as the combined
    // weight so the comparison ratio in the log line is apples-to-apples.
    perGalaxyVmaxOnly[i] = Math.min(WEIGHT_CAP, Math.max(1, vmaxRaw));

    // Combined weight = V_max × angular, capped at [1, WEIGHT_CAP].
    // The angular factor is in [1, WEIGHT_CAP] already (build-time
    // bounds set in `readMergedPositions`), so the product is always
    // ≥ 1 and we never produce zero copies.  The cap protects against
    // the multiplicative explosion case (faint galaxy in an
    // under-detected cell could otherwise hit 100×+ before clamping).
    const angular = input.angularWeights[i]!;
    const combinedRaw = vmaxRaw * angular;
    const weight = Math.min(WEIGHT_CAP, Math.max(1, combinedRaw));
    perGalaxyWeight[i] = weight;
  }

  // Pass 1b: stochastic round each weight to an integer copy count.
  // We do this in a separate loop so the RNG draws are total-ordered
  // (and thus reproducible) before we start emitting positions in
  // pass 2 with Box-Muller draws.  Storing the decision in
  // `copiesPerGalaxy` means pass 2 doesn't re-roll the fractional
  // bit — the two passes stay perfectly aligned.
  const copiesPerGalaxy = new Uint8Array(input.count);
  for (let i = 0; i < input.count; i++) {
    const w = perGalaxyWeight[i]!;
    const intCopies = Math.floor(w);
    const frac = w - intCopies;
    const copies = intCopies + (rng() < frac ? 1 : 0);
    copiesPerGalaxy[i] = copies;
    totalCopies += copies;
  }

  // Pass 2: emit positions.  Copy 1 is the un-jittered original;
  // copies 2..N each receive a fresh Gaussian (σ = JITTER_SIGMA_MPC)
  // offset on each of the three axes.
  const out = new Float32Array(totalCopies * 3);
  let outIdx = 0;
  for (let i = 0; i < input.count; i++) {
    const x = input.positions[i * 3 + 0]!;
    const y = input.positions[i * 3 + 1]!;
    const z = input.positions[i * 3 + 2]!;
    const copies = copiesPerGalaxy[i]!;
    if (copies === 0) continue;
    // Copy 1: exact position, no jitter.
    out[outIdx * 3 + 0] = x;
    out[outIdx * 3 + 1] = y;
    out[outIdx * 3 + 2] = z;
    outIdx += 1;
    // Copies 2..N: Gaussian jitter per axis.
    for (let k = 1; k < copies; k++) {
      const jx = gaussian(rng) * JITTER_SIGMA_MPC;
      const jy = gaussian(rng) * JITTER_SIGMA_MPC;
      const jz = gaussian(rng) * JITTER_SIGMA_MPC;
      out[outIdx * 3 + 0] = x + jx;
      out[outIdx * 3 + 1] = y + jy;
      out[outIdx * 3 + 2] = z + jz;
      outIdx += 1;
    }
  }

  const meanWeight = totalCopies / Math.max(1, input.count);
  // Continuous-weight mean for V_max-only — i.e. what the duplication
  // mean would have been with the previous-build pure-V_max formula.
  // This is the continuous mean (sum of pre-rounding weights / count),
  // not a re-roll of the stochastic round; comparing the continuous
  // means side-by-side keeps the diagnostic stable across runs (the
  // stochastic round is identical between the two by construction).
  let vmaxOnlySum = 0;
  for (let i = 0; i < input.count; i++) vmaxOnlySum += perGalaxyVmaxOnly[i]!;
  const vmaxOnlyMean = vmaxOnlySum / Math.max(1, input.count);
  process.stderr.write(
    `  Combined Malmquist + angular: ${input.count.toLocaleString()} unique → ` +
      `${totalCopies.toLocaleString()} weighted ` +
      `(×${meanWeight.toFixed(2)} combined mean, ` +
      `V_max-only would be ×${vmaxOnlyMean.toFixed(2)}, cap=${WEIGHT_CAP}, ` +
      `σ_jitter=${JITTER_SIGMA_MPC} Mpc)\n`,
  );
  return out;
}

/**
 * Materialise the per-galaxy positions as a TSV file DisPerSE can read.
 * One line per galaxy, three space-separated floats: `x y z` in Mpc.
 *
 * The leading `px py pz` header is *not optional* — it is what makes
 * DisPerSE's `isAsciiSurvey()` (see `src/C/asciiSurvey.c`) classify the
 * file as an ASCII point survey rather than fall through to the generic
 * `NDfield` / FITS detectors and ultimately fail with the unhelpful
 * "ERROR in sampledDataInput: could not read file." message.  Without
 * the header, `delaunay_3D` rejects the file before reading a single
 * point.  Other column names DisPerSE understands are documented in
 * `asciiSurvey.c`: `id, vx/vy/vz, ra/dec, dist, z, mass`.
 *
 * We build the line array first, then `writeFileSync` once.  An earlier
 * version streamed line-by-line via `fs.appendFile` and was ~30× slower
 * for ~3 M galaxies thanks to per-line syscall overhead.  3 M short
 * strings are well under V8's string limits, so the all-in-memory build
 * is fine here.
 */
function writeTsvInput(path: string, positions: Float32Array, count: number): void {
  const lines: string[] = ['px py pz'];
  for (let i = 0; i < count; i++) {
    lines.push(`${positions[i * 3 + 0]!} ${positions[i * 3 + 1]!} ${positions[i * 3 + 2]!}`);
  }
  // Unconditional mkdirSync with `recursive: true` is a no-op when the
  // directory already exists, and avoids a TOCTOU window between the
  // existsSync probe and the mkdir call.
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join('\n') + '\n');
}

/**
 * Run `delaunay_3D` to build a Delaunay tessellation of the point set
 * and return the path to the resulting `.NDnet` file.
 *
 * Why this stage exists at all
 * ----------------------------
 * `mse` does not consume raw point clouds — it expects an N-d simplicial
 * complex (a "network" in DisPerSE-speak, the `.NDnet` format) annotated
 * with a per-vertex scalar field.  For an unstructured galaxy point set
 * the natural complex is the Delaunay tessellation, and the natural
 * scalar field is the Delaunay Tessellation Field Estimator (DTFE)
 * density at each vertex.  Both are produced by `delaunay_3D` (which
 * links against CGAL for the tessellation itself); the resulting
 * `.NDnet` carries DTFE values in its `field_value` field, which `mse`
 * then treats as the function whose Morse-Smale complex defines the
 * cosmic-web filaments.
 *
 * Why we got this wrong before
 * ----------------------------
 * The previous `runDisperse` skipped this stage and handed the raw TSV
 * directly to `mse`.  `mse` accepts a TSV/ASCII-survey only when it can
 * find a per-vertex scalar field already declared in the file (e.g. from
 * a FITS image or pre-built NDnet); on a plain `px py pz` survey it
 * silently produces no output and exits, which is what made `skelconv`
 * (the next stage) fall over with a `null` exit status.  The DisPerSE
 * README documents this as a three-step pipeline (delaunay → mse →
 * skelconv) but the older two-step recipe at the top of the README is
 * for *image* inputs (FITS), not point sets.
 *
 * Output filename gotcha
 * ----------------------
 * `delaunay_3D` writes the NDnet using the *basename* of the input
 * (directory stripped) into the current working directory — not next to
 * the input file.  Verified empirically with a 200-point test: input
 * `/path/to/test_pts.tsv` produces `<cwd>/test_pts.tsv.NDnet`.  We work
 * around this by setting `cwd` to the input's directory, so the NDnet
 * lands where the rest of the pipeline expects.
 */
function runDelaunay3D(tsvPath: string): string {
  const inputDir = dirname(tsvPath);
  const inputBase = basename(tsvPath);
  const ndnetPath = resolve(inputDir, `${inputBase}.NDnet`);

  // Resume: if a previous run already built the Delaunay tessellation,
  // skip this stage.  delaunay_3D is deterministic (the tessellation of a
  // fixed point set is unique up to floating-point ties broken by CGAL's
  // exact predicates), so the cached file is always valid for the same
  // input.  The TSV writer above is fast (~3 s for 2.5 M galaxies); the
  // tessellation itself is ~14 s, also cheap, but the output is ~1 GB
  // and re-writing it on every run is wasteful when the next stage may
  // be the one that crashed.  See the resume rationale on `runDisperse`
  // below for the wider story.
  if (existsSync(ndnetPath)) {
    process.stderr.write(
      `  found existing Delaunay tessellation at ${ndnetPath} — skipping delaunay_3D\n`,
    );
    return ndnetPath;
  }

  process.stderr.write(`running delaunay_3D on ${tsvPath}…\n`);
  const r = spawnSync('delaunay_3D', [tsvPath], {
    stdio: 'inherit',
    cwd: inputDir,
  });
  if (r.status !== 0) {
    throw new Error(`delaunay_3D failed with exit code ${r.status}`);
  }
  if (!existsSync(ndnetPath)) {
    throw new Error(`delaunay_3D exited 0 but expected output ${ndnetPath} is missing`);
  }
  return ndnetPath;
}

/**
 * Run `mse` and `skelconv` on the Delaunay tessellation produced upstream
 * and return the path of the ASCII NDskl file the parser will consume.
 *
 *   1. `mse` extracts the Morse-Smale complex from the NDnet and writes
 *      a binary up-skeleton next to it.  `-upSkl` asks for the up-
 *      skeleton (filaments along ascending density gradient);
 *      `-forceLoops` keeps closed loops in the cosmic web;
 *      `-robustness` computes the per-arc robustness measure (without
 *      it, skelconv's `-trimBelow robustness` aborts with a missing-
 *      field error); `-nsig N` sets the persistence cut in σ.
 *
 *   2. `skelconv` smooths the skeleton, trims segments below the
 *      robustness threshold, and converts the binary to ASCII so the
 *      JS parser doesn't have to decode the proprietary binary form.
 *
 * Output filename gotchas
 * -----------------------
 * Verified empirically against DisPerSE 0.9.25:
 *   - mse writes `<cwd>/<basename(NDnet)>_s<nsig>.up.NDskl`.  Note the
 *     directory of the input is stripped (same gotcha as delaunay_3D)
 *     and the suffix is `_s<N>` not `.s<N>`.
 *   - skelconv with `-smooth N -trimBelow robustness X -to NDskl_ascii`
 *     writes `<input>.S<smooth-zero-padded-3>.TRIM.a.NDskl`.  The "S"
 *     suffix tracks the *smoothing* count, not the cut value (an earlier
 *     version of this script assumed `S<cut>`).  TRIM is appended only
 *     when `-trimBelow` was supplied; "a" marks the ASCII output.
 *
 * Note on flag syntax
 * -------------------
 * mse uses single-dash flags (`-upSkl`, not `--upSkl`).  Passing
 * double-dash forms causes mse to print "What is --upSkl ???" to
 * stdout, exit 0, and produce no output — exactly the silent failure
 * that previously cascaded into a NULL-status skelconv crash.
 *
 * Argv style
 * ----------
 * We use `spawnSync` with the array argv form rather than `execSync`
 * with template-string interpolation: the array form bypasses the shell
 * entirely, so paths with spaces (the project's SDSS CSV already lives
 * at `Skyserver_SQL5_3_2026 6_09_20 PM.csv`) or shell metacharacters in
 * the input path don't break the invocation.  Each step explicitly
 * checks the exit code and throws with the binary name + status so the
 * outer error handler can report something actionable.
 */
function runDisperse(ndnetPath: string, cut: number, smooth: number): string {
  const inputDir = dirname(ndnetPath);
  const ndnetBase = basename(ndnetPath);
  const mscPath = resolve(inputDir, `${ndnetBase}.MSC`);
  const skelRaw = resolve(inputDir, `${ndnetBase}_s${cut}.up.NDskl`);

  // ── Resume policy ───────────────────────────────────────────────────────
  //
  // The mse stage runs in two halves: build the Morse-Smale complex
  // (~22 min wall-clock for 2.5 M galaxies; writes `<ndnet>.MSC`) and
  // then compute persistence pairs + emit the up-skeleton (`.up.NDskl`).
  // The MSC half is the expensive one — 132 kCPU-seconds across threads
  // in the production run.  If a run is interrupted *between* the two
  // halves (e.g. an agent's wall-clock timeout SIGKILL'd the wrapper
  // after MSC was on disk but before the skeleton was), restarting from
  // scratch redoes the expensive half for no reason.
  //
  // mse's `-loadMSC <fname>` flag exists exactly for this case: skip the
  // gradient + complex-construction passes, jump straight to persistence
  // pairs against the cached MSC.  We branch into three paths:
  //
  //   1. `.up.NDskl` already exists → skip mse entirely.  An ascii-skel
  //      pass might still need to run if the user changed `--smooth`,
  //      but the binary skeleton is reusable across smoothing values.
  //   2. `.MSC` exists but `.up.NDskl` doesn't → run mse with
  //      `-loadMSC <mscPath>` so the heavy compute is reused.  Same
  //      `-nsig`, `-upSkl`, `-forceLoops`, `-robustness` flags as the
  //      from-scratch path: these control the persistence-pair phase
  //      and the skeleton output, not the MSC build, so they're still
  //      load-bearing here.
  //   3. Neither exists → from-scratch run.
  //
  // Note: changing `--cut` *between* runs flows through `-nsig` to the
  // persistence-pair phase, which is downstream of the MSC; the cached
  // MSC is still valid.  So `-loadMSC` is safe across cut sweeps too.
  // (Re-tessellating with delaunay_3D is the only stage that depends on
  // input geometry, and that stage is also cached upstream.)
  if (existsSync(skelRaw)) {
    process.stderr.write(`  found existing up-skeleton at ${skelRaw} — skipping mse\n`);
  } else if (existsSync(mscPath)) {
    process.stderr.write(`  found existing MSC at ${mscPath} — resuming mse with -loadMSC\n`);
    const mseResult = spawnSync(
      'mse',
      [
        ndnetPath,
        '-loadMSC',
        mscPath,
        '-upSkl',
        '-forceLoops',
        '-robustness',
        '-nsig',
        String(cut),
      ],
      { stdio: 'inherit', cwd: inputDir },
    );
    if (mseResult.status !== 0) {
      throw new Error(`mse (loadMSC) failed with exit code ${mseResult.status}`);
    }
    if (!existsSync(skelRaw)) {
      throw new Error(
        `mse -loadMSC exited 0 but expected output ${skelRaw} is missing — ` +
          'the cached MSC may be stale relative to the .NDnet input; ' +
          `delete ${mscPath} and re-run to rebuild from scratch.`,
      );
    }
  } else {
    process.stderr.write(`running mse on ${ndnetPath} (this can take hours)…\n`);
    const mseResult = spawnSync(
      'mse',
      [ndnetPath, '-upSkl', '-forceLoops', '-robustness', '-nsig', String(cut)],
      { stdio: 'inherit', cwd: inputDir },
    );
    if (mseResult.status !== 0) {
      throw new Error(`mse failed with exit code ${mseResult.status}`);
    }
    if (!existsSync(skelRaw)) {
      throw new Error(
        `mse exited 0 but expected output ${skelRaw} is missing — ` +
          'check stderr for "What is ... ???" (flag spelling) or a quietly skipped pass.',
      );
    }
  }

  process.stderr.write(`running skelconv (smooth=${smooth})…\n`);
  const skelResult = spawnSync(
    'skelconv',
    [
      skelRaw,
      '-smooth',
      String(smooth),
      '-trimBelow',
      'robustness',
      String(cut),
      '-to',
      'NDskl_ascii',
    ],
    { stdio: 'inherit', cwd: inputDir },
  );
  if (skelResult.status !== 0) {
    throw new Error(`skelconv failed with exit code ${skelResult.status}`);
  }
  // skelconv zero-pads the smoothing count to width 3 ("S002" not "S2").
  const smoothTag = String(smooth).padStart(3, '0');
  const asciiPath = `${skelRaw}.S${smoothTag}.TRIM.a.NDskl`;
  if (!existsSync(asciiPath)) {
    throw new Error(`skelconv exited 0 but expected output ${asciiPath} is missing`);
  }
  return asciiPath;
}

async function main(): Promise<void> {
  const { cut, smooth, sources, outputPath, cachePrefix } = parseArgs();
  process.stderr.write(
    `buildFilaments — cut=${cut}σ smooth=${smooth} sources=[${sources.join(',')}] ` +
      `output=${outputPath}\n`,
  );

  checkDisperse();

  // Set lookup is a few-element membership test in `readMergedPositions`,
  // so we materialise the Set once here rather than threading the array
  // and forcing the callee to re-construct it on every iteration.
  const activeSources = new Set<SourceKey>(sources);
  const tagged = readMergedPositions(activeSources);
  process.stderr.write(`  merged ${tagged.count.toLocaleString()} galaxy positions\n`);

  // Build-time Malmquist V_max + HEALPix angular re-weight correction:
  // amplify both intrinsically-faint galaxies (small d_max → large
  // V_max weight) and galaxies in under-detected sky cells (sparse
  // HEALPix → angular weight > 1) by emitting their product-many
  // jittered copies into the TSV.  V_max corrects RADIAL completeness
  // (volume-limited equivalent), HEALPix corrects ANGULAR completeness
  // (uniform sky-coverage equivalent); applied multiplicatively, the
  // two together give DisPerSE a density field that's been corrected
  // along both axes the survey selection function bites along.  See
  // `applyMalmquistDuplication` for the per-galaxy formula.
  const weightedPositions = applyMalmquistDuplication(tagged);
  const weightedCount = weightedPositions.length / 3;

  // TSV input + DisPerSE NDnet cache filename derive from `cachePrefix`
  // (sorted source keys joined by `+`, e.g. `2mrs+glade` or `sdss`).
  // This guarantees per-build cache isolation: a `--sources sdss` build
  // and a `--sources 2mrs,glade` build coexist on disk without
  // overwriting each other's ~1 GB Delaunay tessellations.  Re-running
  // the SAME source set with a different `--cut` reuses the cached
  // NDnet (delaunay_3D output is cut-independent).
  const tsvPath = join(rawDataPath('filaments.cache-dir'), `galaxies_${cachePrefix}.tsv`);
  writeTsvInput(tsvPath, weightedPositions, weightedCount);
  process.stderr.write(`  wrote ${tsvPath}\n`);

  // Three-stage DisPerSE pipeline: build the Delaunay tessellation +
  // DTFE field, then extract the persistent skeleton, then convert to
  // ASCII.  See the per-function headers for filename gotchas.
  const ndnetPath = runDelaunay3D(tsvPath);
  process.stderr.write(`  built Delaunay tessellation at ${ndnetPath}\n`);

  const ndsklPath = runDisperse(ndnetPath, cut, smooth);
  process.stderr.write(`  parsed skeleton at ${ndsklPath}\n`);

  const skel = parseNDskl(readFileSync(ndsklPath, 'utf8'));
  const cloud = skeletonToFilamentCloud(skel);
  process.stderr.write(
    `  ${cloud.stripCount.toLocaleString()} strips, ` +
      `${cloud.vertexCount.toLocaleString()} vertices\n`,
  );

  const outPath = resolve(outputPath);
  const buf = encodeFilaments(cloud);
  // The `filament/v1/` epoch folder doesn't exist on a fresh checkout —
  // recursive mkdir is a no-op once it does.
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.from(buf));
  process.stderr.write(`wrote ${outputPath} (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)\n`);
}

// Only run when this file is invoked directly (e.g. via `tsx`).  This
// mirrors the buildAllBins pattern so a future test can import helpers
// from this module without triggering DisPerSE.
const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
