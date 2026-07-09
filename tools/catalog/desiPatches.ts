/**
 * DESI_PATCHES — the table of drill geometries the build cuts through the
 * four DESI DR1 LSS clustering FITS files.
 *
 * A "patch" is one way of sampling the same survey: a pencil-beam cone, a
 * declination-band wedge, and (later) a flat great-circle slab. Each row
 * pairs a `Source` code + `.bin` stem with a `makeFilter()` factory that
 * builds the row-membership predicate the parser runs per FITS row. The
 * build (`loadDesiPatch` in `buildAllBins.ts`) loops this table, feeds each
 * patch's kept rows through `crossMatch` under its own source, and emits one
 * `.bin` per patch — so adding a new drill geometry is one row here plus one
 * `Source` registration, not a cloned pipeline path.
 *
 * Adding a patch with a *new* geometry also adds one filter util alongside
 * `makeConeFilter` / `makeDecBandFilter` (e.g. a `makeGreatCircleBandFilter`
 * plane-normal dot-product test) — the factory shape is the only contract a
 * geometry has to satisfy.
 */
import type { DesiTracer } from '../parsers/desiFits';
import type { SourceType } from '../../src/@types/data/SourceType';
import { Source } from '../../src/data/sources';
import { makeConeFilter } from '../utils/math/makeConeFilter';
import { makeDecBandFilter } from '../utils/math/makeDecBandFilter';
import { makeEllipsoidUnionFilter } from '../utils/math/makeEllipsoidUnionFilter';

/**
 * One DESI drill geometry.
 *
 *   - `key`        — short human tag (`'cone'` | `'wedge'` | …), used in
 *                    per-patch build logs and by the census diagnostic to
 *                    find the cone row.
 *   - `source`     — the `Source` this patch's rows are stamped with and
 *                    bucketed under; also the single source of truth for the
 *                    runtime `.bin` stem, via `SOURCE_REGISTRY[source].binBaseName`
 *                    (`tierFilenameForSource`) — no separate `binName` field
 *                    here, since a hand-copied duplicate of that name could
 *                    drift from the registry with no test catching it.
 *   - `makeFilter` — builds the membership predicate. A factory (not a bare
 *                    predicate) so a geometry can hoist its trig / precompute
 *                    once, per `makeConeFilter`'s pattern. The predicate takes
 *                    `(raDeg, decDeg, z)` so a patch can bound the LINE OF SIGHT
 *                    as well as the sky window — the difference between an
 *                    infinite drill (cone, dec-band wedge) and a bounded volume
 *                    floating in space (the Sloan Great Wall's ellipsoid union,
 *                    which bounds a 3D region to isolate one named structure). The two
 *                    sky-only factories (`makeConeFilter`, `makeDecBandFilter`)
 *                    return `(raDeg, decDeg) => boolean` and are left untouched:
 *                    a `(ra, dec) => boolean` is assignable to the 3-arg type
 *                    (arity-compatible), so a filter that doesn't care about
 *                    depth simply doesn't name `z`.
 */
export type DesiPatch = {
  key: string;
  source: SourceType;
  makeFilter: () => (raDeg: number, decDeg: number, z: number) => boolean;
};

/**
 * Cone center + radius — single source of truth for both the cone patch row
 * below and the `desi-cone-census` diagnostic, which re-checks whether a
 * nearby center would pack the cone denser and so needs the raw
 * center/radius numbers the row's `makeFilter` closure doesn't expose.
 */
export const DESI_CONE = { raDeg: 231.85, decDeg: 30.65, radiusDeg: 2.5 } as const;

export const DESI_PATCHES: readonly DesiPatch[] = [
  // ── Cone — the ultra-deep pencil-beam through Corona Borealis ──────────
  //
  // RA 231.85°, Dec +30.65°, radius 2.5° is a measured compromise between
  // two candidates that each fell short on their own:
  //
  //   - The stored `corona-borealis-sc` seed anchor (RA 230.5005°,
  //     Dec +29.0°) is the supercluster's published position, but centering
  //     the cone exactly there runs into the DESI DR1 footprint edge — the
  //     south side of the beam falls outside survey coverage, roughly halving
  //     the row count.
  //   - The DR1 density peak found by a live sampling spike (RA 233.2°,
  //     Dec +32.3° — see the deep-cone design spec) packs several rich Abell
  //     clusters (A2065/A2061/A2067/A2079) at z ≈ 0.07–0.11 densely into one
  //     line of sight, but sits far enough from the seed anchor that neither
  //     the anchor nor those clusters land inside the 2.5° beam.
  //
  // The midpoint of the seed→spike line keeps the anchor 2.0° off-axis (still
  // inside the beam — the supercluster's ~35 Mpc radius spans ~7° at 290 Mpc,
  // enveloping the beam regardless of exact centering) and brings four classic
  // CrB Abell clusters (A2061/A2067/A2079/A2092) into the cone at 77% of the
  // density peak's row count (mild thinning at the far southern rim, where the
  // footprint edge still clips the cone). Isolating the center in `DESI_CONE`
  // makes the census diagnostic's re-center a one-line edit in one place.
  {
    key: 'cone',
    source: Source.DesiDeep,
    makeFilter: () => makeConeFilter(DESI_CONE.raDeg, DESI_CONE.decDeg, DESI_CONE.radiusDeg),
  },
  // ── Wedge — a 2.5°-thick, 65°-long dec-band fan through Corona Borealis ─
  //
  // dec 30.65° ± 1.25° (a band 29.4°–31.9°), RA 205°–270°. The RA span is the
  // contiguous, uniformly-tiled arm of the DR1 NGC footprint: 10–15.5k rows in
  // every 5° bin, cone center RA 231.85° near the middle. The full dec band
  // reaches RA 109°–273°, but DR1 tiling west of RA ~200° is patchy (bins at
  // RA 135–155° and 175–180° near-empty, 120–200° moth-eaten) and would read
  // as rendering artifacts, so the western tail is dropped.
  //
  // Geometry decision — dec band over flat great-circle slab (user A/B,
  // 2026-07-09): a constant-dec band is a section of a cone around the polar
  // axis, bowing ~8% of depth out of the tangent plane at the arm tips, but its
  // density is uniform. The measured flat-slab alternative (plane pole
  // RA 51.85° Dec +59.35°) lost on uniformity — 140,660 rows vs 170,032, its
  // western 10° thinning to 4–5k/bin as the plane drooped out of the well-tiled
  // strip, dark-time tracers dropping hard (LRG −24%, ELG −30%). The band is
  // also the same construction as the 1986 CfA "Great Wall" slice
  // (dec 26.5°–32.5°); ours sits inside it. A trimmed flat slab remains a
  // candidate future patch where its flatness is genuinely clean.
  {
    key: 'wedge',
    source: Source.DesiWedge,
    makeFilter: () => makeDecBandFilter(30.65, 1.25, 205, 270),
  },
  // ── Sloan Great Wall — a sculpted ellipsoid union around one structure ──
  //
  // The Sloan Great Wall, selected by a smooth union of three ellipsoids on the
  // wall's density peaks rather than a flat sky-and-redshift box (see
  // `makeEllipsoidUnionFilter`). The three centres are the measured density
  // peaks of the wall's constituent superclusters — SCl 126 (the rich
  // filament / richest core), SCl 111 (the multispider), plus the poorer
  // western end (Einasto et al. 2011) — in right-handed equatorial Cartesian
  // Mpc. The smooth `smin` union fuses them into one lumpy ribbon (blend
  // 100 Mpc, well under the ~150–180 Mpc peak spacing so the clumps merge
  // rather than staying three beads); a smoothstep feathers the surface over a
  // 50 Mpc band; and a deterministic per-galaxy hash thins that feather so the
  // edges dissolve into haze rather than a hard rind. The ellipsoids follow the
  // wall's true 3D extent, so the selection is NOT clipped to a flat redshift
  // box — it picks up the near/far members that trail off the wall's median
  // depth. LRG/ELG/QSO contribute nothing at z<0.1, so the selection is pure
  // BGS by geometry — every row carries real Legacy-Surveys photometry, no
  // synthetic display magnitudes. The Cartesian seed constants come from a
  // density-peak scan of the wall's BGS rows. A hard RA × Dec × redshift box
  // (RA 137°–214°, Dec −5°..+8°, z 0.055–0.095) was evaluated during
  // development and dropped in favour of this sculpt, whose feathered edges and
  // true-depth extent read as a structure rather than a slab.
  {
    key: 'sgw',
    source: Source.DesiSgw,
    makeFilter: () =>
      makeEllipsoidUnionFilter(
        [
          { center: [-310, -108, 3], radii: [82, 112, 47] }, // SCl 126 (richest core)
          { center: [-285, 67, 3], radii: [78, 103, 43] }, // SCl 111
          { center: [-310, 217, 3], radii: [73, 95, 41] }, // western end
        ],
        { blendMpc: 100, falloffMpc: 25, seed: 20260709 },
      ),
  },
];

/**
 * Raw-data registry keys for the four DESI DR1 LSS clustering FITS files,
 * keyed by the same `DesiTracer` union `parseDesiClustering` accepts.
 *
 * Keyed by `DesiTracer` (not a flat array) so both the build (`loadDesiPatch`)
 * and the census (`tallyTracer`) can look a file up straight from the tracer
 * they are iterating, with no name-to-key mapping step in between. The values
 * are dotted `rawDataRegistry` keys — every raw file goes through `rawDataPath`
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
