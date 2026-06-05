# Flow-Field Integration — Phase A: Format & Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Sister documents:**
> - [`docs/superpowers/specs/2026-06-04-flow-field-integration-design.md`](../specs/2026-06-04-flow-field-integration-design.md) — the approved design. Source of truth; every decision is already made.
> - [`docs/superpowers/conventions/plan-style.md`](../conventions/plan-style.md) — **contract code yes, implementation code no.** Show type signatures, test assertions, byte tables; describe bodies in prose.
>
> **Conventions** (from `CLAUDE.md` + memory):
> - Didactic comments — explain *why* and *what the alternative was*, not just *what*.
> - `type` aliases never `interface`.
> - One type per file under `src/@types`; deep relative imports, no barrels.
> - Route every raw-data path through `rawDataPath('<catalog>.<artifact>')` — never hand-coded `data/raw/...` strings.
> - Single source of truth for config values (read `VITE_DATA_BASE_URL` from `.env.production`).
> - Tests mirror the `src/` / `tools/` tree under `tests/`, vitest `node` env.
> - Never `git add -A` — stage specific paths. Background implementer subagents can't run npm/git — the main thread runs tests/typecheck/commits.
> - **Commits:** conventional-commits style (shown per task); use the user's git identity (never `--author=Claude…`); end every commit body with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Goal

The on-disk scalar-field format carries a `channels` header field (1 or 4) **and**
folds a 4-channel velocity field's runtime stats into the v3 header
(`value_kind = 1`), so the codec round-trips both single-channel (`r16float`)
density cubes and four-channel (`rgba16float`) velocity cubes, and the loader
derives the `GPUTextureFormat` from `channels`. A new `tools/flow/` directory
holds a **pure-TS** builder that reads the CF4++ velocity + density `.npy`
arrays and emits a single self-describing `public/data/flowfield.scfd` (128³
RGBA16F: vx, vy, vz, δ — frame **and** stats in the SCFD header, no sidecar),
added to the R2 `ALLOW` filter. Existing `mcpm` + `cf4-density` cubes re-emit
cleanly under the version-bumped format.

## Architecture

The flow velocity cube is a 4-channel scalar field, stored in the **same SCFD
format** as the density volumes — not a parallel raw blob. We generalize
`src/data/scalarFieldFormat.ts` (was SCFD v2, single-channel f16) with a
`channels` byte and a `value_kind` discriminator: `value_kind = 0` is a scalar
density cube; `value_kind = 1` is a velocity+overdensity field that additionally
carries `velocityStats` (speed/δ percentiles) in the header's reserved region.
The version bumps to v3; the v2 "regenerate" guard already exists, so old `.scfd`
files fail loudly.

The flow build is **pure Node/TS — no Python** (matching `buildCf4Density.ts`).
The CF4++ npz is a zip of `.npy` arrays, so the maintainer extracts
`v_mean_CF4pp.npy` + `d_mean_CF4pp.npy` with `unzip -j`, and `buildFlowField.ts`
reads them via the existing `npyReader`, computes the stats, and replicates
`buildCf4Density.ts`'s already-audited frame recipe (numpy-C-order →
WebGPU-x-fastest transpose; observer-centred `origin`; physical-Mpc box;
`supergalactic-cartesian` frame), so flow registers with the galaxies and the
CF-4 density volume by construction (they share the `d_mean_CF4pp` family). A
known-attractor voxel test (à la `auditCf4Anchors`) guards the frame.

## Tech Stack

TypeScript + Node (`tsx`) for the codec, the pure-TS builder, and R2 sync. No
Python — the npz is unzipped to `.npy` and read by `npyReader` (same pattern as
the CF-4 density build). Vitest for codec round-trip + builder frame-correctness
+ ALLOW-filter tests.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `tools/flow/buildFlowField.ts` | Pure-TS builder: read `v_mean_CF4pp.npy` + `d_mean_CF4pp.npy` via `npyReader`, compute stats, transpose + RGBA-f16 pack (à la `buildCf4Density`), `encodeScalarField` → `public/data/flowfield.scfd`. |
| `tools/flow/flowFieldFrame.ts` | Pure `attractorVoxel(anchor, meta)` helper shared by the builder's frame check and the test. |
| `tests/tools/flow/flowFieldFrame.test.ts` | Known-attractor (Great Attractor / Virgo) lands inside the cube bounds under the emitted frame. |
| `tests/tools/deploy/syncR2.test.ts` (extend) | `ALLOW('flowfield.scfd')` is true; tier-suffixed variant rejected. |

**Modified:**

| File | Change |
|---|---|
| `src/data/scalarFieldFormat.ts` | Task 1: add `channels` byte; version → 3; `gpuTextureFormatForChannels`. Task 3: add `value_kind` + `velocityStats` header block. |
| `src/@types/data/ScalarCube.d.ts` | Task 1: `readonly channels: 1 \| 4`. Task 3: optional `velocityStats`. |
| `tools/utils/io/rawDataRegistry.ts` | Register `cf4.vfield-npz` — the upstream npz, shared with the density pipeline (see Task 2 deviation note). |
| `data/raw/cf4/README.md` (extend) | Add a "Velocity field (flow viz)" section documenting the npz keys, box geometry, SG frame, the `unzip -j` + pure-TS build. |
| `tools/deploy/syncR2.ts` | Add `flowfield.scfd` to `ALLOW` (tier-agnostic). |
| `tools/volumes/buildMcpmVolume.ts` + `tools/volumes/buildCf4Density.ts` | Set `channels: 1` on the emitted cube (done in Task 1, re-emit under v3). |
| `package.json` | Add `build-flow-field` script (pure tsx, no Python). |

---

## Task 1: Generalize `scalarFieldFormat` with a `channels` header field

**Files:** `src/data/scalarFieldFormat.ts` (modify), `src/@types/data/ScalarCube.d.ts` (modify), `tests/data/scalarFieldFormat.test.ts` (modify)

The v2 header reserves byte 22 (was `palette_id`). Reuse it for `channels`.
Version bumps to 3. The voxel-array byte length becomes
`Nx*Ny*Nz*channels*2` (f16). `decodeScalarField` derives nothing about the GPU
format itself — that derivation is a pure exported helper so the loader and
tests share it.

**Header change (byte 22, was reserved):**

```
  22    1   channels    : uint8  (1 = r16float single-channel,
                                    4 = rgba16float; only these two in v3)
```

**Type contract** — `src/@types/data/ScalarCube.d.ts`:

```ts
export type ScalarCube = {
  readonly dims: Vec3;
  readonly channels: 1 | 4;            // NEW — voxel components per cell
  readonly voxels: Uint16Array;        // length = Nx*Ny*Nz*channels (f16 bits)
  readonly frameKind: ScalarFieldFrameKind;
  readonly origin: Vec3;
  readonly voxelSize: number;
  readonly rotation: Vec4;
  readonly valueMin: number;
  readonly valueMax: number;
};
```

**New exported helper** in `scalarFieldFormat.ts`:

```ts
export function gpuTextureFormatForChannels(channels: 1 | 4): GPUTextureFormat;
// 1 → 'r16float', 4 → 'rgba16float'; throws on any other value.
```

- [x] Bump `VERSION = 3`. Update the module header byte table (byte 22 now `channels`).
- [x] Add `channels: 1 | 4` to `ScalarCube` (its own `@types` file already exists — edit it).
- [x] In `encodeScalarField`: write `dv.setUint8(22, cube.channels)`; size the buffer `SCFD_HEADER_BYTES + Nx*Ny*Nz*channels*2`; assert `cube.voxels.length === Nx*Ny*Nz*channels`.
- [x] In `decodeScalarField`: read `channels` at byte 22; reject values other than 1 or 4 with a clear throw; compute `expectedBytes` with the channel multiplier; return `channels` on the cube.
- [x] Add `gpuTextureFormatForChannels`.
- [x] Tests — add to `tests/data/scalarFieldFormat.test.ts`:
  - `encode/decode round-trips a channels=1 cube` — build a tiny 2×2×2 single-channel cube, encode, decode, assert `dims`, `channels === 1`, `voxels` byte-identical, `frameKind`, `origin`, `voxelSize`, `rotation`, `valueMin/Max`.
  - `encode/decode round-trips a channels=4 cube` — 2×2×2 with `voxels.length === 8*4`; same field assertions plus `channels === 4`.
  - `decodeScalarField rejects an unknown channel count` — hand-craft a header with `channels=3`; assert it throws.
  - `gpuTextureFormatForChannels maps 1→r16float and 4→rgba16float` and throws otherwise.
  - `decodeScalarField rejects a v2 header` — assert the existing version guard still fires with the "regenerate" hint for `version=2`.
- [x] `npm test -- scalarFieldFormat` → all pass. `npm run typecheck` → clean. **(Scope note: the `channels: 1` edits to every other `ScalarCube` producer — deferred to Task 5 in the original plan — were pulled into this commit so typecheck stays green on every commit. Task 5 retains only the syncR2 ALLOW additions + tests + operator re-emit note.)**
- [x] Commit: `feat(data): add channels field to scalar-field format (v3)`.

## Task 2: Register the CF4++ npz + provenance

**Files:** `tools/utils/io/rawDataRegistry.ts` (modify), `data/raw/cf4/README.md` (extend)

> **Deviation from the original plan (decided 2026-06-04):** The plan first
> specified a *new* `data/raw/cf4pp/` directory with its own copy of the npz
> and its own README. But `CF4pp_mean_std_grids.npz` is the **same** 167 MB
> upstream ensemble the CF-4 density pipeline already documents under
> `data/raw/cf4/` (it slices `d_mean_CF4pp.npy` from it) — one file, two
> consumers, not "a different release artifact." A parallel `cf4pp/` dir would
> duplicate the maintainer download and the provenance doc (violating
> single-source-of-truth). So the npz is registered **once** as
> `cf4.vfield-npz` pointing at `data/raw/cf4/CF4pp_mean_std_grids.npz`, and the
> provenance is a new section in the existing `data/raw/cf4/README.md`. No
> `cf4pp/` dir, no second README, no extra `.gitignore` line (the cf4 README is
> already whitelisted).

The CF4++ release npz (`CF4pp_mean_std_grids.npz`, ~167 MB) holds six 128³
arrays over a 1000 Mpc/h supergalactic box. The density pipeline already uses
it; the flow extractor is a second consumer of the same file.

**Registry entry** (added within the existing `cf4` group, after `cf4.density-mean`):

```ts
'cf4.vfield-npz': {
  path: 'data/raw/cf4/CF4pp_mean_std_grids.npz',
  kind: 'file',
  source: 'gitignored',
  description:
    'CF4++ mean/std velocity + density ensemble (Courtois 2025). Six 128³ arrays over a 1000 Mpc/h supergalactic box; the flow extractor packs v_mean_CF4pp + d_mean_CF4pp.',
  upstream: 'https://projets.ip2i.in2p3.fr/cosmicflows/',
},
```

- [x] Add the `cf4.vfield-npz` entry to `RAW_DATA` within the existing `cf4` group (a didactic comment explains the one-file-two-consumers rationale).
- [x] Extend `data/raw/cf4/README.md` with a "Velocity field (flow viz)" section: the npz keys (`v_mean_CF4pp`, `d_mean_CF4pp`; the full six-array mean/std set printed at run time), the 1000 Mpc/h supergalactic box, the true SG axis order the production extractor assumes (vs the frame-agnostic spike), and the `build-flow-field` build step.
- [x] (No `.gitignore` change — `!/data/raw/cf4/README.md` already whitelisted.)
- [x] `npm run typecheck` → clean (registry keys are compile-checked via `RawDataKey`).
- [x] Commit: `feat(flow): register CF4++ velocity-field npz + provenance`.

## Task 3: SCFD v3 `value_kind` + `velocityStats` (fold stats into the header)

**Files:** `src/data/scalarFieldFormat.ts` (modify), `src/@types/data/ScalarCube.d.ts` (modify), `tests/data/scalarFieldFormat.test.ts` (modify)

> **Replaces the original "Frame-correct Python extractor" task (decided 2026-06-04).**
> Two decisions reshaped Phase A: (1) the flow cube is **an SCFD file**
> (`channels = 4`), not a raw blob + JSON sidecar; (2) its runtime stats fold
> into the SCFD v3 header, so there is **no sidecar**. That makes the SCFD
> encoding a TS concern (`encodeScalarField`), which in turn makes a Python
> extractor redundant — like `buildCf4Density.ts`, the maintainer `unzip`s the
> `.npy` arrays and a pure-TS builder does the rest (Task 4). A Python
> `extractFlowField.py` was briefly committed then reverted. This task is the
> format half of that reshape.

The flow cube needs three runtime-normalisation stats the generic scalar header
can't express (velocity magnitude is a cross-channel quantity). We discriminate
with the existing `value_kind` byte and fold the stats into the reserved region.

**Header change (`value_kind` at byte 21; stats in the reserved region):**

```
  21    1   value_kind  : uint8  (0 = pre-normalised scalar [0,1];
                                    1 = velocity + overdensity field, channels=4)

  when value_kind = 1 (else these slots stay zero):
  56    4   value_min   : float32  = deltaMin   (δ range reuses the value slots)
  60    4   value_max   : float32  = deltaMax
  64    4   speedKmsMax : float32
  68    4   speedKmsP99 : float32
  72    4   deltaP99    : float32
  76..95    reserved (zero)
```

No version bump — v3 is unshipped, so this rides the existing v3.

**Type contract** — add to `ScalarCube` (inline optional, *not* a new `@types` file):

```ts
  /** Present only on a 4-channel velocity field (value_kind=1); a plain
   *  channels===4 cube may omit it. deltaMin/deltaMax ride valueMin/valueMax. */
  readonly velocityStats?: {
    readonly speedKmsMax: number;
    readonly speedKmsP99: number;
    readonly deltaP99: number;
  };
```

- [x] Add the optional `velocityStats` field to `ScalarCube` (inline); update the didactic header to explain `value_kind` and the δ-range reuse.
- [x] Update the `scalarFieldFormat.ts` byte-table docstring (value_kind=1, the 64/68/72 stat slots, 76..95 reserved).
- [x] `encodeScalarField`: derive `value_kind` from `velocityStats` presence (1 if present, else 0); write the three stats to 64/68/72 when present; throw if `velocityStats` is set on a non-4-channel cube; scalar cubes leave 64..95 zero.
- [x] `decodeScalarField`: read `value_kind` at byte 21; if 1, read `velocityStats` from 64/68/72 and return it; if 0, omit the key; reject any other `value_kind` with a clear throw.
- [x] Tests — extend `tests/data/scalarFieldFormat.test.ts`:
  - velocity round-trip: `value_kind` raw byte === 1, the three stats round-trip (`toBeCloseTo`), `valueMin/valueMax` (δ range) preserved, voxels byte-identical.
  - raw-byte assertion on offsets 64/68/72.
  - scalar cube: `value_kind` === 0, stat slots zero, decoded `velocityStats` undefined.
  - `encode` rejects `velocityStats` on a 1-channel cube.
  - `decode` rejects an unknown `value_kind` (e.g. 2).
- [x] `npm test -- scalarFieldFormat` → all pass. `npm run typecheck` → clean.
- [x] Commit: `feat(data): fold velocity-field stats into the SCFD v3 header`.

## Task 4: pure-TS `buildFlowField` → `flowfield.scfd` + frame helper + test

**Files:** `tools/flow/buildFlowField.ts` (create), `tools/flow/flowFieldFrame.ts` (create), `tests/tools/flow/flowFieldFrame.test.ts` (create), `package.json` (modify), `data/raw/cf4/README.md` (update build section)

Mirrors `buildCf4Density.ts` — **pure Node/TS, no Python**. The CF4++ npz is a
zip of `.npy` arrays; the maintainer extracts the two needed arrays once:

```
unzip -j data/raw/cf4/CF4pp_mean_std_grids.npz \
  v_mean_CF4pp.npy d_mean_CF4pp.npy -d data/raw/cf4/
```

`buildFlowField.ts` then reads both via `npyReader`, computes the stats, applies
the same frame recipe `buildCf4Density.ts` uses, and encodes the SCFD.

**Builder contract:**

```ts
// tools/flow/buildFlowField.ts
export async function buildFlowField(args?: {
  vfieldNpyPath?: string;   // default rawDataPath-relative data/raw/cf4/v_mean_CF4pp.npy
  densityNpyPath?: string;  // default data/raw/cf4/d_mean_CF4pp.npy
  outPath?: string;         // default public/data/flowfield.scfd
}): Promise<void>;
// Reads v_mean (N,N,N,3) + d_mean (N,N,N); computes speedKmsMax/P99 + deltaMin/Max/P99;
// applies the buildCf4Density transpose (outputIdx = k*N*N + j*N + i) packing RGBA-f16
// (R/G/B = native-SG velocity, A = δ); builds a ScalarCube { channels: 4, frameKind:
// 'supergalactic-cartesian', origin: -voxelSize*N/2, voxelSize: 1000/N, valueMin/Max =
// δ range, velocityStats }; encodeScalarField → flowfield.scfd. CLI guard (import.meta.url).
```

The **velocity components ride in native SG order** (R=v_SGX, G=v_SGY, B=v_SGZ)
— the transpose relocates each vector without rotating its basis. This is a
load-bearing assumption (the npz stores SG-Cartesian velocity aligned with the
grid position axes); it cannot be proven from committed code, so document it and
note the maintainer's one-time empirical infall check (flow should converge on
the Great Attractor / Shapley).

**Frame helper + test** — `tools/flow/flowFieldFrame.ts` + `tests/tools/flow/flowFieldFrame.test.ts`.
The test does NOT run the build (CI has no `.npy`). It pins the **frame contract**:
a pure helper mapping a known attractor's RA/Dec/distance to a voxel index from
the cube's `origin`/`voxelSize`/`n`, asserting the attractor sits inside bounds —
mirroring `auditCf4Anchors`. The builder's frame check and the test share the
helper so the contract can't drift. (Note: `flowFieldFrame.ts` is the
parameterised sibling of `tools/utils/math/coordinates.ts`'s hardcoded
`sgToVoxelIndex` — keep a comment pointing at it; if a third consumer appears,
consolidate by parameterising `sgToVoxelIndex` rather than copying again.)

```ts
// tools/flow/flowFieldFrame.ts
export function attractorVoxel(
  anchor: { raHours: number; decDeg: number; distMpc: number },
  meta: { origin: Vec3; voxelSizeMpc: number; n: number },
): { voxel: Vec3; inBounds: boolean };
// raDecDistToEqCart(anchor) → eqToSg → (sg - origin)/voxelSizeMpc per axis; inBounds = all in [0,n).
```

- [x] Create `tools/flow/flowFieldFrame.ts` with `attractorVoxel` (reuse `raDecDistToEqCart` + `eqToSg` from the existing tools-math helpers, as `auditCf4Anchors` does); parameterise the voxel-index math by `meta`.
- [x] Add the test `Great Attractor lands inside the flow cube bounds` — feed a fixture `meta` (production `origin`/`voxelSize`/`n`) + the GA anchor; assert `inBounds === true` and the voxel index is within `[0,n)` on all axes.
- [x] Add the test `Virgo lands inside the flow cube bounds` — same shape for Virgo.
- [x] Create `tools/flow/buildFlowField.ts` per the contract above (pure TS; `npyReader` for both arrays; transpose + pack + `encodeScalarField`; CLI guard). `npyReader` handled the 4D velocity array unchanged; the builder's `asVelocityField` adapter normalises the leading/trailing component layout. Velocity `.npy` default routes through a new `cf4.vfield-mean` registry key.
- [x] Add `"build-flow-field": "tsx tools/flow/buildFlowField.ts"` to `package.json` scripts (pure tsx — no Python).
- [x] Update the `data/raw/cf4/README.md` "Velocity field" build subsection: the `unzip -j` two-array step + the pure-TS `npm run build-flow-field` → `flowfield.scfd`. (Landed in the doc-realignment commit.)
- [x] `npm test -- flowFieldFrame` → pass. `npm run typecheck` → clean.
- [x] Commit: `feat(flow): pure-TS buildFlowField → flowfield.scfd + frame helper + test`.

## Task 5: Add `flowfield.scfd` to R2 ALLOW (+ re-emit note)

**Files:** `tools/deploy/syncR2.ts` (modify), `tests/tools/deploy/syncR2.test.ts` (modify)

The `channels: 1` edits to `buildMcpmVolume.ts` + `buildCf4Density.ts` were
already pulled into **Task 1** (so typecheck stayed green on every commit), so
this task is just the R2 allow-list. The flow `.scfd` joins the tier-agnostic
allow-list (like `2mrs.bin` / `filaments.bin`).

- [x] In `tools/deploy/syncR2.ts` `ALLOW`: add `name === 'flowfield.scfd'` with a comment ("CF4++ velocity cube — tier-agnostic, like filaments.bin").
- [x] Tests — extend `tests/tools/deploy/syncR2.test.ts`: `ALLOW accepts flowfield.scfd`; assert a stray tier-suffixed `flowfield-large.scfd` is rejected (flow is tier-agnostic, no tier suffix).
- [x] `npm test -- syncR2` → pass. `npm run typecheck` → clean.
- [x] (Operator note, not a test step) Re-emit + resync is a deploy action: the v3 bump means the loader's "regenerate" guard fires on the existing `mcpm-*.scfd` + `cf4_density.scfd`, so run `npm run build-tiers` (mcpm/cf4 re-bake under v3), `npm run build-flow-field`, then `npm run sync-r2-secure` from the **main** worktree. A partial deploy ships mismatched `.scfd` — call this out in the PR description.
- [x] Commit: `feat(flow): add flowfield.scfd to R2 ALLOW`.

---

## Spec coverage (Phase A)

- Decision §9 (generalize `scalarFieldFormat` to N channels + fold velocity stats into the v3 header; version bump; loader derives format) → Tasks 1, 3.
- Decision §10 (`tools/flow/` pure-TS builder + npm script + rawDataRegistry + README + syncR2 ALLOW) → Tasks 2, 4, 5.
- Decision §4 work item (builder emits true SG order + origin/voxelSize/frameKind, single self-describing `flowfield.scfd`) → Task 4.
- Testing strategy: format codec round-trip (channels 1 & 4, `velocityStats`) → Tasks 1, 3; builder frame-correctness (known attractor voxel) → Task 4.
- Risk: format version bump forces re-emit of mcpm + cf4-density + R2 resync → Task 5 operator note.
