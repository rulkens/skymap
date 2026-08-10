# Rhizome SCFD Importer (PolyPhy trace → .scfd) — Design

**Status:** Draft (2026-08-10)

**Companion:** the PolyPhy producer pipeline in the `rulkens/PolyPhy` fork
(`~/Development/vendor/python/PolyPhy`, branch `rhizome-sdss-calibration`) and its
spec `rhizome/docs/spec-rhizome-cosmic-web-volume.md` (the "rhizome" three-shell
plan). This doc designs the **first skymap-side piece** of that plan: the importer
that converts PolyPhy-exported MCPM trace cubes into skymap's SCFD v3
scalar-volume format. Runtime work (field handles, AABB-fade compositor, settings
migration) stays in the later rhizome-shells plan and is explicitly **not**
designed here.

**Goal:** one tool, `tools/volumes/buildRhizomeVolume.ts`, that serves two
consumers with one contract:

1. **Now — calibration quick-look.** Convert a single PolyPhy calibration cube
   (`sdss_reproduced.npy` + geometry sidecar) into an `.scfd` written over
   `public/data/mcpm-large.scfd`, so the running dev server renders it with zero
   code changes, side-by-side-able against the published Wilde et al. reference.
2. **Later — rhizome shells.** Convert the three full-sky shell cubes
   (`rhizome_{inner,middle,outer}.npy`) into tiered
   `rhizome-<shell>-{small,medium,large}.scfd` per the rhizome spec's tier table.

The importer defines the **exporter contract** (npy layout + sidecar JSON schema)
that the PolyPhy fork will implement. The schema in this doc is final; the fork
implements to it.

## Background

Skymap's current MCPM pipeline (all verified against source):

- `data/raw/mcpm/trace.bin` (pyslime f16/f32 blob + `export_metadata.txt`) →
  `tools/volumes/extractMcpmCube.py` block-averages d8/d4/d2 →
  `mcpm_sdss_d{8,4,2}.npy` (Python-side downsampling; forced C-order at
  `extractMcpmCube.py:133-140` because `tools/parsers/npyReader.ts:66-68` rejects
  Fortran order).
- `tools/volumes/buildMcpmVolume.ts` log1p-normalises, transposes numpy C-order →
  WebGPU x-fastest, packs f16, and encodes SCFD v3
  (`buildMcpmVolume.ts:139-162`). Its exported `buildMcpmVolume()` already
  accepts `origin`/`voxelSizeMpc` overrides and takes dims from the npy with no
  shape validation (`buildMcpmVolume.ts:82-102`); only the CLI wrapper hardcodes
  the Wilde geometry constants (`buildMcpmVolume.ts:30-64`, pinned by
  `tests/data/mcpmAnchors.test.ts`).
- SCFD v3 (`src/data/volume/scalarFieldFormat.ts`): 96-byte header, f16
  x-fastest payload, self-describing — dims, channels, `frame_kind` byte at
  offset 23, origin (float32 × 3 at offset 24), **a single cubic `voxel_size`**
  (float32 at offset 36), rotation quaternion, valueMin/valueMax.

The PolyPhy fork now produces its own MCPM trace cubes. Its orchestrator
(`rhizome/runRhizomePolyphy.py`) already squeezes PolyPhy's raw 4D `(X, Y, Z, 1)`
trace to 3D float32 and writes an `.npy` plus a JSON sidecar at
`out_path.with_suffix('.json')` — but that sidecar currently carries only run
provenance (params, input hash, commit), **no geometry**. This design adds the
geometry keys the importer needs (see "Exporter-side changes" below).

## Scope

**In scope (this design; one implementation plan later):**

- `tools/volumes/buildRhizomeVolume.ts` — sidecar-driven `.npy` → `.scfd`.
- `tools/parsers/polyphyTraceSidecar.ts` — sidecar parse + validation.
- The `polyphy-trace` v1 sidecar schema (the cross-repo exporter contract).
- Ground preparation: extract the shared log1p/transpose/f16 pack step out of
  `buildMcpmVolume.ts` so both builders share one value transform.
- Skymap-side block-averaging for the shell tiers (decision + rules below).
- Quick-look mode overwriting `public/data/mcpm-large.scfd`, plus the overwrite
  sentinel + `syncR2` refusal guard that keep the reproduced cube out of R2
  (see "Quick-look mode, precisely").

**Out of scope (later rhizome-shells plan):**

- Rhizome field handles in the source registry, AABB-fade compositing, settings
  UI/migration, `cloudLoader` wiring, R2 sync ALLOW-list entries.
- `data/raw/rhizome/` registry keys + provenance README (they land with the
  shell plan, when there are actual shell npys to register).
- Any change to how the VAC reference pipeline works — `extractMcpmCube.py` and
  `buildMcpmVolume.ts`'s CLI stay exactly as they are (modulo the pack-helper
  extraction, which is behaviour-preserving, and the one-line quick-look
  sentinel cleanup in `buildMcpmTier`, below).

## Decision 1 — new tool, not a generalised `buildMcpmVolume.ts`

**Recommendation: a new `tools/volumes/buildRhizomeVolume.ts`, with the shared
value transform extracted to a helper both tools call.**

Why not generalise `buildMcpmVolume.ts`:

- The two tools' _geometry sources_ vary independently and shouldn't be braided:
  the mcpm tool's geometry is checked-in constants transcribed from the VAC's
  `export_metadata.txt` and anti-drift-pinned by `tests/data/mcpmAnchors.test.ts`;
  the rhizome tool's geometry is a per-cube sidecar produced by our own exporter.
  A single CLI serving both would need a mode switch plus two validation regimes
  — a bolt-on by the simplicity convention's standards.
- `buildMcpmVolume.ts` is on a retirement path: the rhizome spec's migration
  section keeps the VAC cube only as a calibration reference. Growing new
  contract surface into a tool scheduled to stop shipping runtime assets is
  backwards.
- The mcpm tool hardcodes `frameKind: 'equatorial-cartesian'`
  (`buildMcpmVolume.ts:174`); rhizome shells are supergalactic. Threading a frame
  parameter through the mcpm public API would churn its tests for no mcpm-side
  benefit.

What IS shared — and why sharing it is load-bearing, not just DRY: the value
transform (raw min/max stats → `log(1+v)/log(1+max)` → C-order→x-fastest
transpose → f16 pack, `buildMcpmVolume.ts:104-162`). The whole point of
quick-look mode is comparing our reproduced cube against the VAC reference under
**identical presentation**. If the two builders' normalisation ever drifted
(say, a p99 clamp added to one), the visual calibration comparison would be
silently corrupted. One shared function makes that drift structurally
impossible. See "Ground preparation".

## Decision 2 — the `polyphy-trace` sidecar schema (final)

One JSON file next to each `.npy`, same basename, `.json` extension — matching
what `runRhizomePolyphy.py` already emits via `with_suffix('.json')`
(`sdss_reproduced.npy` ↔ `sdss_reproduced.json`). Discovery is by convention
only; there is no `--sidecar` override flag. A mismatched cube/sidecar pair is a
provenance bug we refuse to make expressible.

```json
{
  "format": "polyphy-trace",
  "version": 1,
  "dims": [282, 512, 289],
  "origin_mpc": [-498.449, -486.34, -64.526],
  "voxel_size_mpc": [1.8367, 1.8351, 1.8394],
  "frame": "equatorial-cartesian",
  "value_units": "mcpm-trace-density",
  "provenance": {
    "polyphy_commit": "704d755",
    "input_csv": "rhizome/cache/sdss_calibration.csv",
    "input_csv_sha256": "…",
    "params": { "num_iterations": 700, "trace_res_max": 512 },
    "produced_at": "2026-08-10T12:00:00+0200",
    "wall_clock_s": 512.3
  }
}
```

Field semantics (required unless marked optional):

| Field            | Type                 | Meaning                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`         | `"polyphy-trace"`    | Discriminator; rejects accidentally-pointed-at other JSON.                                                                                                                                                                                                                                                                                                            |
| `version`        | `1`                  | Contract version. Importer rejects anything else with a regenerate hint (same style as `scalarFieldFormat.ts:201-204`).                                                                                                                                                                                                                                               |
| `dims`           | `[X, Y, Z]` uint     | Grid dims **after** the trailing-singleton squeeze. Must equal the npy shape; axis 0 of the C-order npy is `dims[0]` (X, slowest), axis 2 is Z (fastest) — same axis convention as the mcpm npys.                                                                                                                                                                     |
| `origin_mpc`     | `[x, y, z]` float    | Position of the **lower corner of voxel (0,0,0)** in `frame` coordinates, comoving Mpc — SCFD origin semantics (`ScalarCube.d.ts:58-59`). NOT the grid center: the Wilde metadata publishes a center and skymap derives the corner (`buildMcpmVolume.ts:53-57`); doing that derivation exporter-side, once, removes a classic half-cube-offset bug from the consumer. |
| `voxel_size_mpc` | `[vx, vy, vz]` float | Per-axis voxel edge length in Mpc. Always 3 elements, even when equal. See Decision 3 for the cubic-collapse rule.                                                                                                                                                                                                                                                    |
| `frame`          | string enum          | Exactly one of `'equatorial-cartesian' \| 'supergalactic-cartesian' \| 'galactic'` — the `ScalarFieldFrameKind` union verbatim (`ScalarFieldFrameKind.d.ts:10`), so the value maps to the SCFD `frame_kind` byte with no translation table. Calibration cube: `equatorial-cartesian`. Rhizome shells: `supergalactic-cartesian`.                                      |
| `value_units`    | string, optional     | Informational. Logged, never validated — the importer's log1p transform assumes non-negative heavy-tailed density regardless.                                                                                                                                                                                                                                         |
| `provenance`     | object, optional     | Opaque to the importer; echoed to the console at build time. Recommended keys shown above (they're what the fork's sidecar already carries today, folded under one key).                                                                                                                                                                                              |

### The `.npy` contract (importer-side acceptance)

- NumPy format v1.0 (`np.save` default), C-order, little-endian.
  `tools/parsers/npyReader.ts` confirms compatibility: v1.x accepted
  (`npyReader.ts:49-51`), Fortran order rejected (`:66-68`), dtypes `<f8`,
  `<f4`, `<f2` (`:76-111`).
- dtype `<f4` is the contract; `<f8` is also accepted (harmless — `readNpy`
  hands back a `Float64Array` and the pack step consumes either, exactly as
  `buildMcpmVolume.ts:98-101` does). `<f2` is **rejected**: block-averaging and
  log-normalising a heavy-tailed trace in half precision loses real information
  (same reasoning as `extractMcpmCube.py:91-101`'s f32 upcast).
- Shape: 3D `(X, Y, Z)`, or raw-PolyPhy 4D `(X, Y, Z, 1)` — the importer
  squeezes a trailing singleton before all other shape checks. Any other rank
  (or a 4D shape whose last axis ≠ 1) is an error. This makes the importer
  robust to being pointed at a raw `data/fits/trace_*.npy` straight out of
  PolyPhy, not just the fork's pre-squeezed outputs.
- Exporter MUST write C-order (`np.ascontiguousarray` before `np.save`) —
  precedent and rationale at `extractMcpmCube.py:133-140`. The fork's
  `squeeze_and_save` already satisfies this (squeeze of a C-order 4D array is
  C-contiguous), but the contract states it so a future exporter path can't
  regress it silently.

### Validation rules and error messages

All validation is importer-side, fail-fast, one error per run (first failure
wins), messages prefixed with the function name per house style
(`decodeScalarField: …`, `readNpy: …`). Exact rules:

| #   | Check                                                                                                                           | Error message shape                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sidecar file exists at `<basename>.json`                                                                                        | `buildRhizomeVolume: no sidecar at <path>; the exporter must write a polyphy-trace v1 JSON next to the .npy (same basename) — see docs/superpowers/specs/2026-08-10-rhizome-scfd-importer-design.md` |
| 2   | JSON parses; `format === 'polyphy-trace'`                                                                                       | `parsePolyphyTraceSidecar: format "<x>" is not "polyphy-trace" — wrong sidecar?`                                                                                                                     |
| 3   | `version === 1`                                                                                                                 | `parsePolyphyTraceSidecar: unsupported version <n> (expected 1); regenerate the cube with the current exporter`                                                                                      |
| 4   | `dims`, `origin_mpc`, `voxel_size_mpc` are 3-element finite-number arrays; dims are positive integers; voxel sizes are positive | `parsePolyphyTraceSidecar: <field> must be 3 finite numbers, got <json>`                                                                                                                             |
| 5   | `frame` is in the `ScalarFieldFrameKind` union                                                                                  | `parsePolyphyTraceSidecar: unknown frame "<x>" (expected equatorial-cartesian \| supergalactic-cartesian \| galactic)`                                                                               |
| 6   | Voxel-size spread within tolerance (Decision 3)                                                                                 | `buildRhizomeVolume: voxel_size_mpc spread <p>% exceeds 0.5% (sizes <vx>, <vy>, <vz>); SCFD stores one cubic voxel size — fix the exporter's grid rounding`                                          |
| 7   | npy rank is 3 (after squeeze)                                                                                                   | `buildRhizomeVolume: expected 3D cube (or 4D with trailing singleton), got shape <s>`                                                                                                                |
| 8   | npy shape equals sidecar `dims`                                                                                                 | `buildRhizomeVolume: npy shape <s> does not match sidecar dims <d> — stale sidecar?`                                                                                                                 |
| 9   | dtype `<f4` or `<f8`                                                                                                            | `buildRhizomeVolume: expected f32/f64 .npy, got dtype <d> (f16 input loses precision before normalisation — export f32)`                                                                             |
| 10  | (shell mode only) dims divisible by the block-average factor                                                                    | `blockAverageCube: dims <s> not divisible by <f> — shell cubes must be 256³` (the check lives in the exported block-average helper; the thrower names itself)                                         |

Negative voxel values are **not** an error: the pack step clamps to ≥ 0 before
log, inheriting the guard and its rationale from `buildMcpmVolume.ts:136-139`.

## Decision 3 — per-axis voxel sizes vs SCFD's single cubic `voxel_size`

PolyPhy rounds grid dims per-axis, so the three voxel edge lengths differ by
<1%. SCFD v3 stores one float (`scalarFieldFormat.ts` header offset 36) and the
renderer assumes cubic voxels. **Rule: the importer asserts relative spread
`(max − min) / mean ≤ 0.005`, then uses the mean.** Enforced in
`buildRhizomeVolume` (rule 6 above), beside the SCFD encoder — the cubic
constraint is SCFD's, not the sidecar schema's, so `parsePolyphyTraceSidecar`
returns `voxel_size_mpc` per-axis verbatim and stays a faithful parse of the
cross-repo contract. A future non-SCFD consumer of the sidecar (a diagnostic
tool, another volume format) is then not bound by this tolerance or robbed of
the per-axis values.

Why 0.5%: using the mean, the worst-case positional error at the far face of a
512-voxel axis is `≤ spread × N = 0.005 × 512 ≈ 2.5 voxels` (typically half
that, ~1.3, when the mean is centred in the spread). For a ray-marched density
overlay that error is below visual significance — filament widths span many
voxels. The example calibration cube (`1.8367 / 1.8351 / 1.8394`) has spread
0.23%, passing with 2× headroom; a genuinely anisotropic cube (e.g. axes
accidentally exported in the wrong units) fails loudly rather than rendering
subtly squashed.

The builder collapses to the mean immediately after the spread assert, and only
the _collapsed_ value flows onward — no code past that point carries per-axis
sizes, so nothing downstream can half-adopt them.

## Decision 4 — CLI shape

```
npx tsx tools/volumes/buildRhizomeVolume.ts <cube.npy> --out <path.scfd>
npx tsx tools/volumes/buildRhizomeVolume.ts <cube.npy> --quick-look
npx tsx tools/volumes/buildRhizomeVolume.ts <cube.npy> --shell inner|middle|outer
```

- Positional arg: the `.npy` path. Sidecar discovered at the same basename with
  `.json` (no override — see Decision 2).
- Exactly one of `--out` / `--quick-look` / `--shell` (mutually exclusive;
  usage error otherwise).
- **`--out`** — single-cube passthrough to an explicit path. No tiering. This is
  the mode tests exercise and the escape hatch for one-off cubes.
- **`--quick-look`** — single-cube passthrough written over
  **`public/data/mcpm-large.scfd`** (gitignored, served by the running Vite dev
  server). The output path is composed from `MCPM_TIER_FILENAME[2]` imported
  from `buildMcpmVolume.ts` — not a restated literal — so the filename keeps
  one home **in `tools/`** (the runtime fetcher composes its own tier
  filenames independently — `src/services/loading/fetchers/mcpmFetcher.ts:24-26`
  — so a divergence there fails loud as a 404, not silently). This is the
  calibration loop's viewer mode; details below.
- **`--shell <name>`** — tiered production mode for the rhizome shells; emits
  `public/data/rhizome-<shell>-{small,medium,large}.scfd` per Decision 5. The
  flag is _specified_ here so the tool's argument surface is stable, but its
  implementation can land with the later rhizome-shells plan (it is inert until
  shell npys and runtime field handles exist). An `npm run build-rhizome`
  script is added at that point, mirroring `build-mcpm`; quick-look stays a
  direct `tsx` invocation — it is a maintainer/calibration action, not part of
  any data-rebuild order in `docs/DATA.md`.

### Quick-look mode, precisely

Overwriting `mcpm-large.scfd` means the calibration cube is served through the
**existing, unmodified** mcpm runtime path. What the cube inherits in that mode
(all presentation, from the hardcoded mcpm registry entry
`src/data/sources/mcpm.ts:17-24`): **inferno palette**, contrast 1.7,
densityScale 18.0, exposure 18.0, trim 0.3, envelope (0.85, 1.05), default-on
visibility. What it does **not** inherit: the coordinate frame — `frame_kind`
rides in the `.scfd` header byte (offset 23), so a cube whose sidecar declares
`equatorial-cartesian` (the calibration cube) or `supergalactic-cartesian`
renders in its own declared frame automatically. Note the inherited palette is
inferno, not the magma the rhizome spec names as the eventual default — fine
for a structural comparison, and the palette selector can switch it at runtime.

Operational notes the tool prints on completion:

- The viewer fetches `mcpm-<tier>.scfd` per the tier setting
  (`src/data/sources/mcpm.ts:16`, filenames `buildMcpmVolume.ts:41-45`), so the
  quick-look cube is only visible with the tier set to **large**; the tool says
  so. We deliberately do not overwrite all three tier files — a ≥512-axis cube
  is ~150 MB of f16 and triplicating it buys nothing.
- Restore the shipped reference with `npm run build-mcpm` (rebuilds all three
  mcpm tiers from `data/raw/mcpm/mcpm_sdss_d{8,4,2}.npy` and clears the
  quick-look sentinel, below).

**R2 guard.** `mcpm-large.scfd` matches the `sync-r2` allow-list
(`tools/deploy/r2/allowDataFile.ts:14`), so an overwritten reference plus one
forgotten rebuild would silently ship the reproduced cube to production as the
MCPM reference. Quick-look therefore writes a sentinel
`public/data/mcpm-large.scfd.quicklook` beside its output — **before** the
overwrite begins, so a mid-write failure can never leave a truncated
reference unflagged; `syncR2.ts`
hard-fails while the sentinel exists (message: run `npm run build-mcpm`), and
`buildMcpmTier(2)` deletes it when it rewrites the real reference. The sentinel
itself never syncs — `allowDataFile` is an allow-list. Same principle as the
shared pack helper: the corrupted-ship path is made structurally impossible
rather than documented away.

Zero **runtime** code changes are needed for quick-look — that constraint is
the mode's entire design; the R2 guard touches two tool files, never the viewer
path. It also means the reproduced-vs-reference comparison is apples-to-apples:
same renderer, same presentation defaults, same normalisation (guaranteed by
the shared pack helper, Decision 1).

## Decision 5 — tiering lives skymap-side (in the importer)

The rhizome spec's tier table implies skymap-side block-averaging; the current
MCPM precedent puts downsampling fork/Python-side (`extractMcpmCube.py`).
**Recommendation: skymap-side, in `buildRhizomeVolume.ts`.**

- The MCPM precedent was forced, not chosen: the VAC source is a 2.3 GB pyslime
  blob that can't reasonably ship to contributors, so Python had to downsample
  before publishing (`data/raw/mcpm/README.md`). A rhizome shell is 256³ f32 =
  **64 MB** native — the forcing constraint is gone, and R2 can host the single
  canonical npy per shell.
- It halves the exporter contract. Fork-side d2 variants would each need their
  own sidecar (dims halve, voxel size doubles) — more files, more schema
  surface, more drift opportunities across a repo boundary. With skymap-side
  tiering the contract stays "one npy + one sidecar per shell", and the derived
  tier's header fields are computed in the same function that encodes them.
- It is testable where the tests live: a TS block-average gets a tiny vitest
  fixture; the fork's Python tests can't see skymap's encoder to verify the
  derived headers.

Rules:

- Block-average on **linear f32 values, before log1p normalisation**; each tier
  is then normalised by its own max — byte-identical semantics to today's
  pipeline, where `extractMcpmCube.py` averages linear f32
  (`downscale_local_mean`, `:126-140`) and `buildMcpmVolume.ts` log-normalises
  each tier independently.
- Factor-2 only (256³ → 128³); dims must divide exactly (validation rule 10).
  Quick-look and `--out` modes never tier, so odd calibration dims (289…) are
  unaffected.
- Tier mapping per shell (constants in the tool, transcribed from the rhizome
  spec's tier table):

  | Shell  | large         | medium        | small     |
  | ------ | ------------- | ------------- | --------- |
  | inner  | 256³ (native) | 256³ (native) | 128³ (d2) |
  | middle | 256³ (native) | 256³ (native) | 128³ (d2) |
  | outer  | 256³ (native) | 128³ (d2)     | 128³ (d2) |

  Identical content under two tier filenames (e.g. `inner-large` ≡
  `inner-medium`) is accepted — filenames are the runtime's tier contract, and
  32 MB of R2 duplication is cheaper than a tier-aliasing mechanism.

- Derived tier geometry: dims/2, voxelSize×2, origin **unchanged** (the lower
  corner of voxel (0,0,0) is the same point; only the cell size changes —
  same invariant as `mcpmTierAnchors`, `buildMcpmVolume.ts:47-64`).

## Output mapping (sidecar + npy → `ScalarCube`)

| `ScalarCube` field      | Source                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dims`                  | npy shape (== sidecar `dims`); halved for d2 tiers                                                                                                                                                         |
| `channels`              | `1`                                                                                                                                                                                                        |
| `voxels`                | shared pack helper: clamp ≥ 0 → `log(1+v)/log(1+max)` → axis 0↔2 transpose to x-fastest (`buildCf4Density.ts:159-172` rationale) → f16 bits                                                                |
| `frameKind`             | sidecar `frame`, verbatim                                                                                                                                                                                  |
| `origin`                | sidecar `origin_mpc`, verbatim (already the voxel-(0,0,0) corner)                                                                                                                                          |
| `voxelSize`             | mean of sidecar `voxel_size_mpc` (Decision 3); ×2 for d2 tiers                                                                                                                                             |
| `rotation`              | `[0, 0, 0, 1]` always — the renderer's `FRAME_TO_WORLD` applies the frame rotation; writing a frame rotation here compounds it (the rotation-doubling landmine documented at `buildCf4Density.ts:193-204`) |
| `valueMin` / `valueMax` | raw pre-normalisation stats (diagnostic, matching `buildMcpmVolume.ts:104-111`)                                                                                                                            |

## Ground preparation

One behaviour-preserving refactor, its own commit, sequenced before the feature
commit (whether it rides this branch's PR or its own is the user's call at
checkpoint, per convention):

- Extract the stats + log1p-normalise + transpose + f16-pack block
  (`buildMcpmVolume.ts:104-162`) into
  `tools/utils/volume/packLogTraceVoxels.ts` — one exported function per the
  tools-utils convention:
  `packLogTraceVoxels(values: Float32Array | Float64Array, dims: Vec3): { voxels: Uint16Array; valueMin: number; valueMax: number }`.
  `buildMcpmVolume.ts` calls it; no new tests for the refactor. (The existing
  `tests/tools/buildMcpmVolume.smoke.test.ts` pins only dims/header fields — its
  symmetric 4×4×4 cube cannot see an axis swap or a normalisation change. The
  real pin is the importer plan's asymmetric transpose fixture, which guards
  both builders through the shared helper.)
  The didactic comments about heavy-tailed log mapping and the transpose move
  with the code.

No other ground work: `readNpy`, `encodeScalarField`, `f32ToF16Bits` are
consumed as-is, and `buildCf4Density.ts` keeps its own (different — symmetric)
normalisation untouched.

## Testing strategy

Vitest, mirroring the existing volume-builder patterns
(`tests/tools/buildMcpmVolume.smoke.test.ts`, the tiny-fixture style of
`tests/data/volume/scalarFieldFormat.test.ts`). Judged by the house bar — "will
it ever fail on a real bug nothing else catches?":

- **`tests/tools/buildRhizomeVolume.smoke.test.ts`** — write a synthetic f32
  npy + sidecar pair into a tmpdir (reusing the local `writeF32Npy` helper
  pattern from the mcpm smoke test), run `--out`, decode with
  `decodeScalarField`, assert dims / `frameKind` from sidecar / origin /
  voxelSize == mean / identity rotation / raw valueMin/valueMax.
- **Transpose fixture with asymmetric dims** (e.g. 2×3×4, one hot voxel at a
  known (i,j,k)): assert the decoded x-fastest index holds it. This is the test
  the mcpm builder explicitly lacks (`buildMcpmVolume.ts:144-150` notes only a
  visual smoke test would catch a transpose regression) — asymmetric dims make
  an axis swap change the answer. It doubles as the pin on the extracted
  `packLogTraceVoxels`.
- **4D squeeze acceptance**: shape `(2, 3, 4, 1)` npy builds; shape
  `(2, 3, 4, 2)` errors.
- **Sidecar validation table**: missing sidecar; `version: 2`; dims/npy shape
  mismatch; voxel-size spread > 0.5%; unknown `frame` — each asserting the
  error-message substring from the rules table. These are contract errors a
  future exporter change would trip; the messages are the cross-repo debugging
  surface, so they're worth pinning loosely (substring, not full string).
- **Block-average** (shell-mode tier path, exercised via its exported function
  rather than the full `--shell` CLI): 4×4×4 of exactly-representable values →
  2×2×2 known means; derived header dims/2, voxelSize×2, origin unchanged;
  non-divisible dims error.
- **Quick-look R2 guard**: with the `.quicklook` sentinel present, `syncR2`'s
  gate refuses (exercised via the exported check, not a live sync). This is the
  only line defending production from a calibration overwrite, so it earns a
  pin.

Deliberately **not** tested (per `docs/superpowers/conventions/testing.md`): the
tier-filename mapping table (a constant restatement; quick-look's output path
is the imported `MCPM_TIER_FILENAME[2]`, so there is no second copy to pin),
and any re-assertion of `encodeScalarField` behaviour already covered by
`tests/data/volume/scalarFieldFormat.test.ts`.

## Exporter-side changes required (PolyPhy fork — for its implementer)

The fork's `runRhizomePolyphy.py` sidecar currently carries run provenance only.
To satisfy `polyphy-trace` v1 it must:

1. Add `format: "polyphy-trace"`, `version: 1`.
2. Add `dims` (post-squeeze shape), `origin_mpc` (**voxel-(0,0,0) lower
   corner**, not grid center — derive corner = center − dims·voxel/2 exporter-
   side), `voxel_size_mpc` (per-axis, from PolyPhy's actual grid extent ÷ dims),
   and `frame` (`equatorial-cartesian` for the calibration cube;
   `supergalactic-cartesian` for the later shells).
3. Fold the existing keys (`params`, `input_csv`, `input_csv_sha256`,
   `polyphy_commit`, `wall_clock_s`, `produced_at`) under `provenance`.
   (`cube_shape` is superseded by `dims`.)
4. Keep `np.save` of a C-contiguous f32 3D array (already true; now contractual).

## Risks / open questions

- **Calibration-cube voxel spread.** If a PolyPhy run's per-axis rounding ever
  exceeds 0.5%, quick-look hard-fails. That's intended — but if it bites in
  practice, the fix is exporter-side (pad dims to equalise), not a looser
  importer tolerance. Flagging so the failure isn't "fixed" by raising the bar.
- **Quick-look tier friction.** Requiring the "large" tier selection is one
  manual step per session. If it annoys, a follow-up flag could also overwrite
  `mcpm-medium.scfd`; not worth 150 MB of default disk churn until it does.
- **`--shell` timing.** Specified now, implemented with the shells plan. If the
  shells plan wants different tier mappings after seeing real payload sizes,
  only the constants table in the tool changes — the sidecar contract and pack
  path are tier-agnostic by construction.
