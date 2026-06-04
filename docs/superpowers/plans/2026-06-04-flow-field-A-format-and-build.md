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

The on-disk scalar-field format carries a `channels` header field (1 or 4); the
codec round-trips both single-channel (`r16float`) and four-channel
(`rgba16float`) cubes, and the loader derives the `GPUTextureFormat` from it.
A new `tools/flow/` directory holds a **frame-correct** Python extractor + a tsx
wrapper that emit `public/data/flowfield.bin` (128³ RGBA16F: vx, vy, vz, δ) plus
a JSON sidecar, registered in the raw-data registry and the R2 `ALLOW` filter.
Existing `mcpm` + `cf4-density` cubes re-emit cleanly under the version-bumped
format.

## Architecture

The flow velocity cube is a 4-channel scalar field. Rather than a parallel
codec, we generalize `src/data/scalarFieldFormat.ts` (currently SCFD v2,
single-channel f16) with a `channels` byte. The version bumps to v3; the v2
"regenerate" guard already exists, so old `.scfd` files fail loudly. The flow
extractor is rehomed and **fixed** from cosmic-flow's `convertCf4ppVfield.py`,
which deliberately ignored frame alignment ("we label the three array axes
z,y,x arbitrarily"). The new extractor emits the true supergalactic axis order
plus `origin`/`extent`/`frameKind` matching `cf4-density`, so flow registers
with the galaxies and the CF-4 density volume by construction. A
known-attractor voxel test (à la `auditCf4Anchors`) guards the frame.

## Tech Stack

TypeScript + Node (`tsx`) for the codec, wrapper, and R2 sync. Python + numpy
for the extractor core (one-off per CF4++ npz release, like the MCPM extractor).
Vitest for codec round-trip + extractor frame-correctness + ALLOW-filter tests.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `tools/flow/extractFlowField.py` | Frame-correct Python core: read CF4++ npz, emit true-SG-order RGBA16F `.bin` + JSON sidecar (vx,vy,vz,δ). |
| `tools/flow/buildFlowField.ts` | tsx wrapper around the Python core (mirrors `build-mcpm`); resolves paths via `rawDataPath`, invokes Python, validates output. |
| `tests/data/scalarFieldFormat.test.ts` (extend) | Codec round-trip for `channels=1` and `channels=4`; derived `GPUTextureFormat`. |
| `tests/tools/flow/extractFlowFieldFrame.test.ts` | Known-attractor lands in expected voxel under the emitted frame. |
| `tests/tools/deploy/syncR2.test.ts` (extend) | `ALLOW('flowfield.bin')` is true; sidecar allowed. |

**Modified:**

| File | Change |
|---|---|
| `src/data/scalarFieldFormat.ts` | Add `channels` header byte; version → 3; derive format; round-trip 1 and 4 channels. |
| `src/@types/data/ScalarCube.d.ts` | Add `readonly channels: 1 \| 4` field. |
| `tools/utils/io/rawDataRegistry.ts` | Register `cf4.vfield-npz` — the upstream npz, shared with the density pipeline (see Task 2 deviation note). |
| `data/raw/cf4/README.md` (extend) | Add a "Velocity field (flow viz)" section documenting the npz keys, box geometry, SG frame, build. |
| `tools/deploy/syncR2.ts` | Add `flowfield.bin` + sidecar to `ALLOW`. |
| `tools/volumes/buildMcpmVolume.ts` + `tools/volumes/buildCf4Density.ts` | Set `channels: 1` on the emitted cube (re-emit under v3). |
| `package.json` | Add `build-flow-field` script. |

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
- [ ] Commit: `feat(flow): register CF4++ velocity-field npz + provenance`.

## Task 3: Frame-correct Python extractor

**Files:** `tools/flow/extractFlowField.py` (create)

Rehomed and **fixed** from `tools/cosmic-flow/data/convertCf4ppVfield.py`. The
spike deliberately ignored frame alignment. The new extractor must emit the
**true SG axis order** and `origin`/`extent`/`frameKind` matching `cf4-density`
(the same `d_mean_CF4pp` family the CF-4 density volume already uses), so the
WebGPU `writeTexture` x-fastest upload lands each voxel where the renderer's
`buildCubeModelMatrix` expects it.

The packing is RGBA16F C-order `[z][y][x][c]`, R=vx G=vy B=vz A=δ. The
**fix vs the spike** is the axis mapping: determine the correct
`(numpy axis → SG axis)` permutation and sign so a known attractor (Great
Attractor / Virgo) lands at its expected voxel. Use the same percentile-of-anchor
methodology `tools/volumes/auditCf4Anchors.ts` uses for the density cube — the
velocity field shares the cube's spatial layout, so the density-derived
permutation transfers. Document the chosen permutation in the module docstring
with the anchor evidence.

**Sidecar JSON keys** (consumed by the Phase-B loader): `n`, `boxMpcPerH`,
`origin` (Vec3, SG-cartesian Mpc lower corner), `voxelSizeMpc`, `frameKind`
(`'supergalactic-cartesian'`), `speedKmsMax`, `speedKmsP99`, `deltaMax`,
`deltaP99`.

- [ ] Create `tools/flow/extractFlowField.py` reading `data/raw/cf4/CF4pp_mean_std_grids.npz` (registered as `cf4.vfield-npz`), writing `public/data/flowfield.bin` + `public/data/flowfield.json`.
- [ ] Normalise `v_mean_CF4pp` to `(N,N,N,3)` (handle leading- or trailing-component layouts, as the spike does).
- [ ] Apply the frame-correct axis permutation + sign so SG axes map to numpy axes correctly; document the permutation + the anchor evidence in the docstring.
- [ ] Pack RGBA16F C-order `[z][y][x][c]`, R/G/B = velocity, A = δ.
- [ ] Emit the sidecar JSON with the keys above, including `origin`/`voxelSizeMpc`/`frameKind` so the loader can build the model matrix.
- [ ] Print the speed/δ stats + the chosen permutation for the operator log.
- [ ] (No automated test for the Python directly — Task 4's TS test loads the emitted `.bin`. Run manually once: `python3 tools/flow/extractFlowField.py` after fetching the npz.)
- [ ] Commit: `feat(flow): frame-correct CF4++ velocity-field extractor`.

## Task 4: tsx build wrapper + npm script

**Files:** `tools/flow/buildFlowField.ts` (create), `package.json` (modify), `tests/tools/flow/extractFlowFieldFrame.test.ts` (create)

Mirrors the `build-mcpm` pattern: a thin tsx wrapper resolves paths via
`rawDataPath`, shells out to the Python core, and validates the emitted
`.bin`/`.json` (byte length == `n³ * 4 channels * 2 bytes`, sidecar keys
present). Pure orchestration — the numeric work is in Python.

**Wrapper contract:**

```ts
// tools/flow/buildFlowField.ts
export async function buildFlowField(): Promise<void>;
// Invokes the Python extractor with rawDataPath('cf4.vfield-npz') as input,
// writes public/data/flowfield.{bin,json}, then asserts the output byte length
// and sidecar key set. Throws on mismatch. CLI-invokable (import.meta.url guard).
```

**Frame-correctness test** — `tests/tools/flow/extractFlowFieldFrame.test.ts`.
The test does NOT run Python (CI has no numpy + no 167 MB npz). Instead it pins
the **frame contract**: a pure helper that, given the emitted sidecar
`origin`/`voxelSizeMpc`/`frameKind`, maps a known attractor's RA/Dec/distance to
the expected voxel index. The assertion mirrors `auditCf4Anchors`: the attractor
sits inside the cube bounds and at a plausible voxel rank. Factor the
SG→voxel-index math into a shared pure helper the extractor's TS-side sidecar
validation and this test both call, so the contract can't drift.

```ts
// Pure helper (TS side, e.g. tools/flow/flowFieldFrame.ts):
export function attractorVoxel(
  anchor: { raHours: number; decDeg: number; distMpc: number },
  meta: { origin: Vec3; voxelSizeMpc: number; n: number },
): { voxel: Vec3; inBounds: boolean };
```

- [ ] Create `tools/flow/flowFieldFrame.ts` with `attractorVoxel` (reuse `raDecDistToEqCart` + `eqToSg` from the existing tools-math helpers, as `auditCf4Anchors` does).
- [ ] Add the test `Great Attractor lands inside the flow cube bounds` — feed a fixture `meta` (the production `origin`/`voxelSize`/`n`) + the GA anchor; assert `inBounds === true` and the voxel index is within `[0,n)` on all axes.
- [ ] Add the test `Virgo lands inside the flow cube bounds` — same shape for Virgo.
- [ ] Create `tools/flow/buildFlowField.ts` per the contract above; validate output byte length + sidecar keys; CLI guard.
- [ ] Add `"build-flow-field": "tsx tools/flow/buildFlowField.ts"` to `package.json` scripts.
- [ ] `npm test -- extractFlowFieldFrame` → pass. `npm run typecheck` → clean.
- [ ] Commit: `feat(flow): buildFlowField wrapper + build-flow-field script + frame test`.

## Task 5: Re-emit existing volumes under v3; add to R2 ALLOW

**Files:** `tools/volumes/buildMcpmVolume.ts` (modify), `tools/volumes/buildCf4Density.ts` (modify), `tools/deploy/syncR2.ts` (modify), `tests/tools/deploy/syncR2.test.ts` (modify)

The version bump means the loader's "regenerate" guard fires on the existing
`mcpm-*.scfd` + `cf4_density.scfd`. Both builders construct a `ScalarCube`
literal — they must now set `channels: 1`. The flow `.bin` joins the
tier-agnostic R2 allow-list (like `2mrs.bin` / `filaments.bin`).

- [ ] In `buildMcpmVolume.ts` add `channels: 1` to the `ScalarCube` literal (around the `frameKind: 'equatorial-cartesian'` block).
- [ ] In `buildCf4Density.ts` add `channels: 1` to its `ScalarCube` literal.
- [ ] In `tools/deploy/syncR2.ts` `ALLOW`: add `name === 'flowfield.bin'` and `name === 'flowfield.json'` with a comment ("CF4++ velocity cube — tier-agnostic, like filaments.bin").
- [ ] Tests — extend `tests/tools/deploy/syncR2.test.ts`: `ALLOW accepts flowfield.bin` and `ALLOW accepts flowfield.json`; assert a stray `flowfield-large.bin` is rejected (it's tier-agnostic, no tier suffix).
- [ ] `npm test -- syncR2` → pass. `npm run typecheck` → clean (the `ScalarCube` literals now satisfy the new `channels` field; this clears the Task-1 residual typecheck failures).
- [ ] (Operator note, not a test step) Re-emit + resync is a deploy action: `npm run build-tiers` (mcpm/cf4 re-bake), `npm run build-flow-field`, then `npm run sync-r2-secure` from the **main** worktree. A partial deploy ships mismatched `.scfd` — call this out in the PR description.
- [ ] Commit: `feat(flow): re-emit volumes under v3, add flowfield to R2 ALLOW`.

---

## Spec coverage (Phase A)

- Decision §9 (generalize `scalarFieldFormat` to N channels; version bump; loader derives format) → Tasks 1, 5.
- Decision §10 (`tools/flow/` extractor + wrapper + npm script + rawDataRegistry + README + syncR2 ALLOW) → Tasks 2, 3, 4, 5.
- Decision §4 work item (extractor emits true SG order + origin/extent/frameKind) → Task 3.
- Testing strategy: format codec round-trip (channels 1 & 4) → Task 1; extractor frame-correctness (known attractor voxel) → Task 4.
- Risk: format version bump forces re-emit of mcpm + cf4-density + R2 resync → Task 5 operator note.
