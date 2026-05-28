# Local-volume distances — design

> **Status: design spec, not yet planned.** Captured 2026-05-27 after the
> ΛCDM-distances PR (#186) surfaced the bug that 2MRS rows with negative
> cz collapse onto the origin, and made it clear that the underlying
> problem — redshift-based distances are unreliable below ~10 Mpc — is
> a real, pre-existing accuracy gap worth fixing properly. The
> regression itself was un-regressed in #186 by restoring the linear-
> sign mapping (`redshiftToDistanceMpc.ts`), so this spec is about the
> structural improvement, not the immediate bug.

## What it is

Replace cz-derived distances with **redshift-independent measured
distances** for galaxies inside the local volume (out to ~30 Mpc),
sourced from a real distance catalog. Outside that radius the Hubble-
flow law is fine; inside it, peculiar velocities dominate and the
catalog should win.

## Why it matters

`raDecZToCartesian` places every galaxy at `radius = redshiftToDistanceMpc(z)`,
which is `c·z/H₀` near the Local Group. The decomposition is
`cz = H₀·d + v_pec` with peculiar velocities ±300 km/s. The fractional
distance error is `v_pec / (H₀·d)`, so:

| Distance | Hubble cz | Fractional error |
|---|---|---|
| 2 Mpc | 140 km/s | ~200 % |
| 5 Mpc | 350 km/s | ~85 % |
| 10 Mpc | 700 km/s | ~40 % |
| 20 Mpc | 1400 km/s | ~20 % |
| 30 Mpc | 2100 km/s | ~15 % |

Concrete counts in 2MRS (44,599 rows; counted in #186):

| cz bin | ≈ distance | rows |
|---|---|---|
| cz < 0 | (mirrored by linear-sign fallback) | 25 |
| 0–350 km/s | < 5 Mpc | 52 |
| 350–700 | 5–10 Mpc | 121 |
| 700–1400 | 10–20 Mpc | 666 |

So ~865 galaxies inside 20 Mpc have peculiar-velocity-contaminated
positions today, plus the 25 mirrored blueshifts. Two regimes worth
spelling out:

- **Local Group / nearby groups** (true distance < 5 Mpc): M31/M33/M81
  and friends. Redshift distance is meaningless — these need a
  catalog or nothing.
- **Virgo blueshifts** (M86, M90, M98, …): redshift puts them at
  negative or near-zero distances; the truth is ~16 Mpc in the Virgo
  cluster. The linear-sign fallback in #186 leaves them mirrored at
  ~3 Mpc in the *anti*-Virgo direction. Cosmetically OK because the
  Virgo Cluster (other members with positive cz) still draws in the
  right place, but those 25 individual rows are in the wrong sky region.

## Goal

For every 2MRS / GLADE / Famous row inside ~30 Mpc that has a
redshift-independent distance measurement (Cepheid, TRGB, TF, SNIa,
SBF, …), bake the position from that distance at build time and ignore
the redshift. Outside 30 Mpc, keep the current ΛCDM path.

## Data source candidates

### Cosmicflows-4 (CF4) — recommended

Tully et al. 2023, the current state-of-the-art compilation:
55,877 galaxies with TF, SNIa, SBF, FP distances, fully homogenised.
Covers the entire local volume out to z ≈ 0.05 (~200 Mpc) with high
density inside 30 Mpc. Distance estimates are mutually-calibrated
across method.

- **Pros:** one catalog, homogeneous, well-vetted, current. Includes
  group/cluster distance corrections via peculiar-velocity model.
- **Cons:** large download (~100 MB raw); column layout is non-trivial
  (CDS table J/ApJ/944/94); needs a fetcher.
- **Coverage of our 865 local rows:** CF4 has explicit overlap with
  2MASS so cross-matching by 2MASS ID is clean.

### Extragalactic Distance Database (EDD) — fallback

Tully's earlier compilation, ~200,000 entries spanning multiple
methods. Mostly subsumed by CF4 now but covers some dwarf/satellite
galaxies CF4 doesn't list explicitly.

- Use case: fill gaps if CF4 misses a 2MRS row we care about.

### HyperLEDA `mod0` column — already half-integrated

We already fetch HyperLEDA columns for diameter + orientation (see
`tools/fetch/fetchHyperLeda.ts`). Adding `mod0` (distance modulus,
redshift-independent where present) would pull distances for the same
~52k PGCs we cache.

- **Pros:** zero new fetcher, just one extra column on an existing
  query.
- **Cons:** sparse — `mod0` is null for most rows; quality varies
  (some entries are old single-method, not the homogenised CF4
  values). Per the project memory, the HyperLEDA cache is intentionally
  partial (52k/~1.5M PGCs) and shouldn't auto-refetch.
- **Use case:** light supplementary fill, not a primary source.

### NED-D — explicitly rejected

NED's redshift-independent distance compilation. Comprehensive but
fragmented: every distance is a separate row with its own method,
reference, and provenance; collapsing to one number per galaxy is
manual work CF4 already did.

### Decision

**Primary: CF4.** Cross-match by 2MASS ID (for 2MRS) and PGC (for
GLADE / Famous via the existing PGC alias map). Fall back to HyperLEDA
`mod0` for the ~10–20 % of local rows CF4 misses (likely dwarfs and
satellites). No NED-D, no EDD unless CF4 + HyperLEDA leave a real gap.

## Integration approach

At **build time**, inside the build pipeline (`tools/catalog/buildAllBins.ts`):

```
for each ParsedRecord:
  distMpc = catalogDistanceFor(record)     // CF4 → HyperLEDA → null
  if distMpc != null and distMpc < CUTOFF_MPC:
    pos = raDecDistToCartesian(ra, dec, distMpc)
  else:
    pos = raDecZToCartesian(ra, dec, z)    // existing ΛCDM path
```

with `CUTOFF_MPC = 30` (chosen so the Hubble-flow error drops to
<15 %). The catalog lookup is a Map keyed by 2MASS ID + a Map keyed by
PGC; rows that miss both fall through to the redshift path unchanged.

`raDecDistToCartesian` already exists (`src/utils/math/`), so no new
math.

### Why build time, not runtime

Same rationale as everything else baked into `.bin`: positions are
load-bearing for the renderer's apparent-size and pick paths, and
threading a per-row override through the runtime would add a lookup
to the hot path for no benefit. Catalog lookups happen once at
`buildAllBins` time.

## Cross-matching

Three identifiers do the heavy lifting:

- **2MASS XSC ID** — already on every 2MRS row (the `massId` field
  the parser preserves transiently). CF4 publishes the 2MASS ID for
  its galaxies with 2MASS counterparts.
- **PGC** — already cross-walked via the `PgcAliasMap` (the
  `tools/fetch/buildPgcAliases.ts` cache). CF4 lists PGC directly.
- **Position cone-match (1 arcmin)** — fallback when neither
  identifier matches. Necessary because the CF4 → 2MASS ID join is
  not 1:1 for compact group members.

## Out of scope

- **Peculiar-velocity field models** (e.g. CF4's own velocity model).
  Would let us go further out and correct *every* nearby galaxy, not
  just those with direct distance measurements. Significant complexity
  for diminishing returns past the catalog coverage.
- **Per-galaxy distance uncertainties.** CF4 publishes them; we'd
  store one number per row. Surfacing the uncertainty in the InfoCard
  is a separate UI question.
- **Famous-galaxy curated distance overrides.** Once CF4 is in,
  hand-curated overrides for the 25 negative-cz rows in this PR are
  redundant. Don't ship a curated table.
- **Going beyond 30 Mpc** with CF4 distances. CF4 covers further out
  but the Hubble-flow distance is good enough there and adding the
  catalog dependency for marginal improvement isn't worth it.

## File-format impact

Positions stay `Float32Array` xyz in Mpc — we're changing how they're
computed, not the position layout. But the catalogued redshift is no
longer recoverable from `|position|` for local-volume rows (M31 at
0.78 Mpc has |pos|=0.78 → z=+0.00018, not the published −0.001), so
the bin needs to carry the spectroscopic z separately for InfoCard
display. The plan must decide whether to spend a field (v6 format
bump) or reuse spare bits on existing fields; this is a real
design call, not a pure pipeline change.

Build pipeline re-bakes `2mrs.bin` and `glade-{small,medium,large}.bin`
in either case.

The CF4 + HyperLEDA distance lookup table itself is a build-time
artifact, not a runtime asset — it doesn't ship to R2.

## Resolved decisions

These were the open questions on the 2026-05-27 draft; resolved in a
grill session with the maintainer the same day.

1. **`CUTOFF_MPC = 30 Mpc.`** Hubble-flow error drops to ~15 % at the
   boundary (peculiar velocities of ±300 km/s vs. Hubble cz of
   ~2100 km/s) — the regime where the catalog finally stops winning
   by a clear margin. Covers Local Group, Virgo, M81 group, all of
   CF4's dense inner shell.
2. **CF4 overrides existing rows only — no new galaxies.** Skymap
   stays a renderer, not a curator. 2MRS already carries the Local
   Group (including the negative-cz rows since #186), and CF4 supplies
   better distances for cross-matched rows. Adding CF4-only galaxies
   would raise source-of-truth questions for fields CF4 doesn't
   publish (g/r/i mags) and bleed into curation.
3. **Unmatched local-volume rows stay on cz-derived distance.** The
   linear-sign-restored fallback from #186 is at least *somewhere*
   plausible; dropping rows hides real galaxies. The error is honest
   (mirrored or peculiar-velocity-perturbed) rather than collapsed.
4. **CF4 fetcher is a simple long-running script.** Single ~100 MB
   file behind one URL, but written as a resumable fetcher (chunked
   download with on-disk progress) so a partial download survives a
   network blip. Pattern follows `tools/fetch/fetchHyperLeda.ts` but
   simpler — no pagination, just resume-on-restart.
5. **Store original cz/z on the row; InfoCard displays the catalogued
   value, not the position-derived one.** Spectroscopic z is what
   astronomers expect to see (matches NED/SIMBAD); position is for
   rendering. These are different concepts and must be stored
   independently — see the *File-format impact* section above for the
   design choice the plan needs to make.

## Estimated lift

Roughly: 1 day to write the CF4 fetcher + parser + cross-match logic;
0.5 day to plumb the override into `buildAllBins`; 0.5 day for
regression tests on the affected rows (M31 at 0.78 Mpc, M86 at 16.8
Mpc, etc.). Plus a `build-tiers` rerun and R2 sync to ship.

## Predecessor

This spec builds on #186's `feat(cosmology): ΛCDM comoving distances`
work, specifically the negative-z linear-sign fallback in
`src/utils/math/redshiftToDistanceMpc.ts:54-56` and its regression
test. Reading the function's docstring (which references this spec
by name) is the recommended entry point for picking this up later.
