# Survey-to-parameters map — design draft

Goal: every real galaxy in the survey catalogs gets a **plausible, deterministic**
procedural body. The renderer asks one question — "give me GalaxyParams for this
catalog row" — and the answer is stable across sessions, grounded in measured
distributions, and varied galaxy-to-galaxy.

Status: DRAFT, built in parallel with the analytic-field renderer work. The
range tables below carry per-cell confidence tags from a verified-fetch
literature pass (2026-08-01); cells marked SECONDARY/GAP need a full-text pull
before they become load-bearing.

## Pipeline shape

```
catalog row ──► observables ──► class posterior ──► parameter ranges ──► seeded draw ──► GalaxyParams
                (per-source)     (exact or fuzzy)     (literature)         (mulberry32)
```

Three stages, one seed:

1. **Observables** (all already in the v8 .bin record): colour index, apparent
   mags (5 per-source bands), spectroscopic z → absolute magnitude, diameterKpc
   (+ fallback flag), axisRatio (inclination proxy), classByte (unused today),
   source id.
2. **Classification** → a coarse morphological class with confidence:
   - **2MRS: exact.** The raw catalog carries ZCAT morphological T-types for
     ~21k galaxies (ReadMe note G1, bytes 165–169) which the parser currently
     DROPS. First pipeline task of this workstream: slice the T-type digit into
     `classByte` (the slot documented for exactly this) and rebuild. T-type →
     class directly, no proxy.
   - **SDSS: colour separator.** All five ugriz mags are in the record, so the
     verified Strateva u−r = 2.22 cut applies as-is (early E/S0/Sa above, late
     Sb/Sc/Irr below). Refinement axis: absolute magnitude (Baldry-style
     CM-dependent separator) — GAP: per-bin Gaussian params not yet pulled.
   - **GLADE: weakest.** Only B−J colour + M_B + diameter; classification is a
     coarse red/blue prior, wide ranges, and that's honest — GLADE galaxies are
     also the most distant/smallest on screen.
   - Caveat carried into the posterior: ~6% of late-type discs are red
     ("red spirals", Masters 2010, SECONDARY) — classification emits
     probabilities, not certainties, and the draw samples the posterior.
3. **Seeded draw.** Seed = hash of the stable identity string from
   `encodeGalaxyId` (`sdss-<objID>` / `pgc-<objID>` / `pos@ra,dec`) →
   `mulberry32`. Same idiom as `fallbackOrientation`'s build-time hash seeding.
   Constraint: the draw must respect observables the catalog _measures_ —
   axisRatio (inclination) and diameterKpc are inputs, never rolled.

## Parameter range table (v0)

Confidence: V = verified primary text, S = secondary, GAP = number not yet
recovered — do not ship a constant from a GAP cell without the full-text pull.

| Parameter               | Early spiral (Sa–Sb)                                                                       | Late spiral (Sc–Sm)                                         | Elliptical/S0 | Basis                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| Pitch angle             | bimodal low peak ~12° (S)                                                                  | high peak ~23° (S); trend earlier=tighter (V, Yu & Ho 2019) | —             | per-stage means GAP                                                                                  |
| Arm count               | 2 dominant (64% of massive spirals 2-armed, S, Hart/GZ2: 5/64/18/6/7% for 1/2/3/4/5+)      | multi-arm/flocculent rises toward latest types (V trend)    | —             | per-type split GAP                                                                                   |
| Arm–interarm contrast K | up to ~2 grand design (V, Rix & Zaritsky)                                                  | ~1.2–1.4 flocculent-leaning (S, MW anchor 1.32)             | —             | feeds `armContrast`                                                                                  |
| Per-arm age mix         | mixed old/young (MW verified two-armed in old light)                                       | younger overall                                             | —             | drives flux weight + future SFR/colour                                                               |
| B/T                     | 0.24 median Sa–Sb (V, Graham & Worley K-band)                                              | 0.04 median Scd–Sm (V)                                      | high / n/a    | factor ~2 scatter at fixed type (V)                                                                  |
| Disc scale length       | R ∝ L^0.25–0.5, type-dependent slope (V, Courteau); R ∝ M^0.22 late types (V, van der Wel) | same law                                                    | —             | **zero-point GAP** — needs Table 1 pull; interim: calibrate on diameterKpc, which we have per galaxy |
| h_z/h_R                 | thicker at earlier type (S)                                                                | ~0.12–0.14 typical (S, Kregel)                              | —             | absolute per-stage value GAP                                                                         |
| Colour → class cut      | u−r ≥ 2.22 early (V, Strateva)                                                             | u−r < 2.22 late (V)                                         | u−r ≥ 2.22    | SDSS only; 2MRS/GLADE adapters GAP                                                                   |

Interim rule for GAP normalizations: where the catalog measures the quantity
directly (scale length via diameterKpc), the measurement wins and the law is
only used for the parameters the catalog can't see.

## Module shape (sketch)

```ts
// src/services/engine/galaxyGenerator/shared/paramMap/  (new)
export type GalaxyObservables = {
  readonly source: Source;
  readonly colourIndex: number;      // per-source ramp position
  readonly absMag: number;
  readonly diameterKpc: number;      // measured — constrains, never rolled
  readonly axisRatio: number;        // measured inclination proxy
  readonly tType?: number;           // 2MRS only, via classByte
};

export type MorphClass = 'elliptical' | 'lenticular' | 'earlySpiral' | 'lateSpiral' | 'irregular';
export type ClassPosterior = ReadonlyArray<{ readonly cls: MorphClass; readonly p: number }>;

export type ParamRange = { readonly min: number; readonly max: number; readonly tag: 'V' | 'S' | 'GAP' };
export type ClassRanges = Readonly<Record<keyof GeneratorParams, ParamRange>>; // per MorphClass

classify(obs: GalaxyObservables): ClassPosterior;          // exact for T-type, fuzzy otherwise
drawGalaxyParams(obs: GalaxyObservables, ranges: RANGE_TABLE, seed: number): GalaxyParams;
```

`RANGE_TABLE` is a plain registry keyed by MorphClass — growth = a new row or a
tightened range, never a code branch. The tag rides into the data so a GAP cell
is visible at the callsite, not just in this doc.

## Open tasks (in workstream order)

1. 2MRS T-type parser branch → classByte + bin rebuild (self-contained, unlocks
   exact classification for 21k galaxies).
2. Full-text pulls for the GAP constants (ADS full-text, not abstracts — the
   abstract-level fetch wall is documented in the research pass).
3. Per-source colour adapters (u−r is SDSS-native; 2MRS J−K and GLADE B−J need
   their own separators or a transform onto u−r).
4. `paramMap` module per the sketch, calibrated in the galaxy-renderer tool
   (drive it from a "random survey galaxy" button before wiring the real app).
