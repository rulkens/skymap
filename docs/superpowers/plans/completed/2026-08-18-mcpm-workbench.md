# MCPM Workbench (Polyphorm → browser WebGPU) — implementation plan

> **Shipped 2026-08-21** via PR #570 (squash `fb7cb02a2`); the 6-bit pick
> widening spun off early as PR #609. Executed with subagent-driven
> development; deviations from the plan text (P2 promotion redesigned as a
> hidden dedicated source after a revert, quirk-flag outcomes, the 9.28×
> trace-mass ratio ruled a documented offset — see
> `docs/research/mcpm-trace-mass-offset.md`) are recorded in the archived
> ledger beside this plan.

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` to
> implement this plan task-by-task, under
> [`docs/superpowers/conventions/sdd-execution.md`](../conventions/sdd-execution.md). Steps use
> checkbox (`- [x]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-08-18-mcpm-workbench-design.md`](../specs/2026-08-18-mcpm-workbench-design.md).
Every design question is settled there and in the grill session it cites
([`docs/grill-sessions/mcpm-workbench-2026-08-18.md`](../../grill-sessions/mcpm-workbench-2026-08-18.md),
Q1–Q13). **Do not re-litigate.** Where this plan and the spec disagree, the spec wins — except for
the contracts §"Plan-authored contracts" below, which the spec left open and this plan pins.

**Goal:** a browser workbench at `npm run mcpm-workbench` (port 5500) that fits MCPM
(Monte Carlo Physarum Machine) to skymap's own v9 galaxy catalogs on the GPU, shows the trace field
live while parameters are tuned, and exports volumes the existing rhizome importer eats unchanged.
Kernels are a verbatim-with-quirks port of the `rulkens/Polyphorm` fork's WGSL, re-addressed from
r32float textures to `array<f16>` storage buffers.

**Architecture:** three homes (spec §4) — the kernel + view shader family in
`src/services/gpu/shaders/mcpm/` (runtime-positioned, zero consumers in the app today), the host in
`tools/mcpm-workbench/` (a sibling Vite app on the flow-workbench pattern), and the `.npy` writer in
`tools/parsers/npyWriter.ts` beside its reader. React imports no GPU; the sim layer imports no
React; they meet at the hand-rolled store and the harness handle.

**Tech stack:** TypeScript + Vite + React 18 (`@vitejs/plugin-react`), raw WebGPU, WESL via
`wesl-plugin`'s `staticBuildExtension` (`?static`), Vitest for pure TS, Playwright-driven headless
Chromium for the GPU probe. No redux anywhere in the tool.

**Source material for the kernel ports.** The fork is at `~/Development/vendor/cpp/polyphorm`, tag
`v1.0-macos-port`. Its WGSL kernels are at `shaders/*.wgsl` (verified present 2026-08-18:
`cs_agents_propagate.wgsl`, `cs_field_decay.wgsl`, `cs_density_histo.wgsl`,
`cs_particles_transform.wgsl`, `cs_particles_blit.wgsl`, `cs_volpath.wgsl`, `cs_volpath_blit.wgsl`,
`ps_volume_trace.wgsl`, `vs_2d.wgsl`, `vs_3d.wgsl`). The HLSL→WGSL porting diary is at that repo's
`docs/superpowers/research/m2…m5/`; each porting task below names the file to read.

## Ground preparation

Spec §3: three prep refactors, **each its own commit**, sequenced before the feature commits and
riding this PR as leading commits. They are tasks **P1–P3** below. The adjacent finding (duplicate
f16 decoders) goes to `docs/BACKLOG.md`, not into this PR — that is a DoD line, not a task.

## Global constraints

- `type` aliases, never `interface`. Deep relative imports, no barrels. One exported function per
  file under `utils/`, one type per file under `@types/`. The tool's `@types/*.d.ts` files hold real
  `export type` declarations imported normally (see `tools/flow-workbench/@types/state/Store.d.ts`),
  not ambient globals — so every type named in an interface block below lives in its own `@types`
  file and the implementation file imports it.
- Comment budget: module header ≤ 10 lines, comment lines ≤ half the file's code lines. A comment
  earns its place by recording a landmine, a unit, a derivation, or a cross-file contract.
  Ported-kernel files: the *only* comments that earn their place are the quirk explanations and the
  texture→buffer addressing notes. Do not annotate the Monte Carlo maths.
- **Any file move or rename goes through `npm run move-files -- <from> <to>`** (ts-morph rewrites
  every relative import project-wide and drags the `tests/` mirror along). Never `git mv` plus
  hand-edited imports. `--dry` first. See `.claude/skills/refactor/SKILL.md`.
- **Every task that edits a `.wesl` file must invoke the project's `wesl-shaders` skill first.** The
  linker constraints it documents (`package::` literal paths, no backticks, the duplicate
  `@builtin(position)` runtime-only failure) are not discoverable from the files.
- Tests live under `tests/` mirroring the tree: `tests/tools/mcpm-workbench/**`,
  `tests/parsers/npyWriter.test.ts`, `tests/tools/buildRhizomeVolume.smoke.test.ts`. Judge every
  test by [`testing.md`](../conventions/testing.md)'s one question — no mirror tests, no constant
  restatements, no clamp-boundary tests, no runtime type assertions. Spec §12 lists what is
  deliberately **not** tested; respect it.
- Typecheck is `npm run typecheck` (both tsconfigs; `tsconfig.tools.json` already covers all of
  `tools/`, so the new tool needs no tsconfig registration). Dev server is `npm run mcpm-workbench`.
- Stage specific paths in every commit; never `git add -A`. Format only touched files.
- `npm test` and `npm run typecheck` stay green at every commit.
- **Nothing in this tool writes to `public/data` or the data manifest.** Exports are browser
  downloads. Promoting one to a shipped asset stays `buildRhizomeVolume --out` / `--quick-look`.

## Plan-authored contracts

The spec pins the public surfaces it cared about. These six it left open; this plan decides them so
the tasks have a contract to hit. Each is cheap to overturn at review.

1. **`AgentInitMode = 'aroundData' | 'uniform'`** — the two agent-init modes spec §2 lists, named.
2. **`planGridBudget`** — the preflight of spec §5 is a pure function over `GPUSupportedLimits`, so
   the refusal is testable without a device (Task 9).
3. **`McpmHarness`** — the handle shape the React layer talks to (Task 9).
4. **The comparator's `--meta` flag** — mapping data points into voxels needs an origin and voxel
   size. A `.npy` side gets them from its same-basename sidecar; a headless `.bin` side has no
   header, so it takes `--meta <export_metadata.txt>` (Task 22).
5. **Histogram lands in Phase 3, not Phase 1.** Spec §13's Phase 1 exit criteria don't name it and
   the spec gives it no phase; it is the live convergence signal Phase 3's noise-floor measurement
   reads, so it opens Phase 3.
6. **The probe's catalog is synthetic and in-tool**, reached by a `?probe` query parameter, so the
   GPU gate never touches the network or `public/data` (Task 12).

## Dependency DAG

Implementers are strictly serial (one working tree — upstream SDD rule stands). This DAG exists for
**Rule 2 pipelined reviews**: dispatch implementer N+1 alongside reviewer N only when their **Files**
sets are disjoint. Tasks on the same line are file-disjoint from each other.

```
P1 ∥ P2  →  P3                                   (prep; P3 edits a file P2's move-files rewrites)
P1, P2 ────────────────┐
T1 (scaffold) → T2 ∥ T3 ∥ T6 ∥ T7 ∥ T8           (T3 → T4 ∥ T5)
                       └→ T9 (harness) → T10 ∥ T11 → T12 → T13  [PHASE 1 GATE]
T13 → T14 ∥ T15 → T16 ∥ T17 ∥ T18 → T19          [PHASE 2 GATE]
T13 → V1 ∥ V2 ∥ V3                               [TRACK V, any time after T13]
T19 → T20 ∥ T21 ∥ T22 → T23                      [PHASE 3 GATE]
T23 → T24 ∥ T25                                  [PHASE 4]
```

Sequential (never overlap a review): P2→P3, T1→everything tool-side, T3→T4/T5, T9→T10/T11,
T13/T19/T23 gates.

---

# Ground preparation

### P1: `initGpu` grows a device-request options parameter

**Files:** `src/services/gpu/device.ts` (modify)

**Interface — produces:**

```ts
export type InitGpuOptions = {
  /** Requested in addition to timestamp-query; silently dropped if the adapter lacks one. */
  readonly requiredFeatures?: readonly GPUFeatureName[];
  /** Clamped per-key to the adapter's advertised maximum. */
  readonly requiredLimits?: Readonly<Record<string, number>>;
};

export async function initGpu(
  canvas: HTMLCanvasElement,
  options?: InitGpuOptions,
): Promise<GpuContext>;
```

**Behaviour (spec §3 P1, §15 decision 1):** drop-and-clamp, never throw. Extend the mirror pattern
already at `device.ts:82-86` — a requested feature the adapter lacks is dropped; a requested limit
above `adapter.limits[key]` is clamped down to it. Callers read `device.features` / `device.limits`
for truth. `requestDevice` throws on either violation, and both are recoverable at the workbench
(no `shader-f16` ⇒ the f32 grid path; a clamped `maxBufferSize` ⇒ a smaller grid).

Both existing call sites — `src/services/engine/phases/initGpu.ts:91`,
`tools/flow-workbench/src/createFlowHarness.ts:84` — pass no options and must stay unedited.

**Tests:** none. The clamp is a two-line map over an adapter object; a Vitest fake `GPUAdapter`
would be testing the mock. The real gate is Task 9's preflight and the probe.

- [x] Read `device.ts:50-100` for the existing mirror pattern and its comment budget.
- [x] Add `InitGpuOptions` (one type, exported from `device.ts` beside `GpuContext` — this is a
      service module, not `@types/`, so co-location is correct).
- [x] Widen `initGpu`'s signature; merge the caller's features into the existing `timestamp-query`
      mirror; clamp each requested limit against `adapter.limits`.
- [x] Trim the existing Step-2 comment block rather than growing it — the file is already at its
      comment budget.
- [x] `npm run typecheck` → GREEN, with neither call site touched.
- [x] Commit `src/services/gpu/device.ts`: `refactor(gpu): initGpu takes a device-request options parameter`.

---

### P2: `packLogTraceVoxels` moves into `src/`

**Files:** moved by the tool — `tools/utils/volume/packLogTraceVoxels.ts` →
`src/utils/volume/packLogTraceVoxels.ts`, `tools/utils/math/f32ToF16Bits.ts` →
`src/utils/math/f32ToF16Bits.ts`. ts-morph rewrites the importers
(`tools/volumes/buildRhizomeVolume.ts`, `tools/volumes/buildMcpmVolume.ts`, the verifiers) and drags
`tests/tools/utils/math/f32ToF16Bits.test.ts` to `tests/utils/math/`.

**Why (spec §3 P2):** the browser tool must call the *real* packing code for its SCFD export and
preview view. `src/` never imports `tools/` (79 importers one way, zero the other); a browser bundle
rooted in `tools/` may import either. So the shared helper moves to the side both reach.

**Exact invocations — do not substitute `git mv`:**

```
npm run move-files -- --dry tools/utils/volume/packLogTraceVoxels.ts src/utils/volume/packLogTraceVoxels.ts
npm run move-files -- tools/utils/volume/packLogTraceVoxels.ts src/utils/volume/packLogTraceVoxels.ts
npm run move-files -- tools/utils/math/f32ToF16Bits.ts src/utils/math/f32ToF16Bits.ts
```

**Tests:** none new. Behaviour-preserving move; the existing `f32ToF16Bits` test travels with it.
(Note for the reviewer: `packLogTraceVoxels` has no test file today, contrary to spec §12's aside.
Adding one is out of scope here — it is captured as a DoD backlog line.)

- [x] Run both moves with `--dry` first, read the reported import rewrites, then for real.
- [x] Grep the repo for the old paths afterwards — `move-files` does not rewrite string literals,
      `?static` / `?worker` suffixes, or `vi.mock` paths
      (`reference_move_files_blind_spots`). Fix any survivors by hand.
- [x] `npm run typecheck` → GREEN. `npm test -- f32ToF16Bits buildRhizomeVolume buildMcpmVolume` → GREEN.
- [x] Commit the moved files plus every rewritten importer:
      `refactor(volume): packLogTraceVoxels moves into src/ for the browser tool`.

---

### P3: the rhizome importer accepts f16 `.npy`

**Files:** `tools/volumes/buildRhizomeVolume.ts` (modify),
`tests/tools/buildRhizomeVolume.smoke.test.ts` (modify)

**Why (spec §3 P3):** the guard at `buildRhizomeVolume.ts:90-98` ("Rule 9") rejects `<f2` because
half precision loses information before block-averaging and log-normalisation. That reasoning
assumes an f32 producer narrowing on export. Ours is the reverse: the trace grid **is** f16 in GPU
memory, so an f32 `.npy` would be a widened copy at twice the file size carrying no extra
information.

**Behaviour:** accept `<f2` by widening through `tools/utils/math/f16BitsToFloat.ts` into a
`Float32Array` before the stats/normalise step. Keep the rejection for every other dtype and reword
its message to name f16 as accepted. `readNpy` already returns `<f2` as raw f16 bits in a
`Uint16Array` (`tools/parsers/npyReader.ts:34`).

**Test-first** — `tests/tools/buildRhizomeVolume.smoke.test.ts`:

- [x] Add `builds an f16 .npy to the same .scfd values as its f32 equivalent, within f16 rounding` —
      construct one value array, write it both ways through the fixture path the existing smoke test
      uses, build both, and compare decoded voxels within f16 epsilon. Confirm it FAILS on the
      current guard before implementing.
- [x] Implement the widening branch; leave the non-f16/f32/f64 rejection intact.
- [x] `npm test -- buildRhizomeVolume` → GREEN.
- [x] Commit both files: `feat(rhizome): buildRhizomeVolume accepts f16 .npy input`.

---

# Phase 1 — walking core

Spec §13. Exit criteria are Task 13. **Keep this path lean** — nothing here that the exit criteria
do not demand.

### T1: tool scaffold and build wiring

**Files (create):** `tools/mcpm-workbench/index.html`, `vite.config.ts`, `wesl.toml`,
`tsconfig.json`, `README.md`, `src/main.tsx`, `src/render/RenderGraph.ts`,
`src/render/shaders/blit.wesl`, `src/ui/App.tsx`, `src/ui/Viewport.tsx`.
**Files (modify):** `package.json`.
**Files (create, test):** `tests/tools/mcpm-workbench/viteConfig.smoke.test.ts`.

**Templates to read, not to guess at:** `tools/flow-workbench/vite.config.ts`,
`tools/flow-workbench/wesl.toml`, `tools/flow-workbench/tsconfig.json`,
`tools/flow-workbench/src/main.tsx`, `tools/flow-workbench/src/engine/RenderGraph.ts`,
`tools/flow-workbench/src/engine/shaders/blit.wesl`.

**Contract (spec §11):**

- `package.json` gains `"mcpm-workbench": "vite --config tools/mcpm-workbench/vite.config.ts"`.
- `vite.config.ts`: `root: resolve(__dirname)`, `publicDir: resolve(__dirname, '../../public')`,
  `server: { port: 5500 }`, plugins `[viteWesl({ extensions: [staticBuildExtension], weslToml:
  resolve(__dirname, 'wesl.toml') }), react()]`. **The explicit `weslToml` is mandatory, not
  stylistic** — the plugin otherwise reads `<process.cwd()>/wesl.toml` and npm scripts keep cwd at
  the repo root, so the tool would silently link the runtime's shader set.
- `wesl.toml`: `edition = "unstable_2025"`, `root = "../../src/services/gpu/shaders"`,
  `include = ["../../src/services/gpu/shaders/**/*.wesl", "src/render/shaders/*.wesl"]` — the same
  arrangement `tools/flow-workbench/wesl.toml` documents at length, so `package::mcpm::grid`
  resolves identically in both apps.
- The tool keeps exactly **one** local `.wesl`: `src/render/shaders/blit.wesl`, an HDR→swapchain
  tonemap, imported relatively with `?static`.
- `App.tsx` renders `Viewport` on skymap's chrome by importing `src/styles/global.css` and
  referencing its tokens, as the sibling tools do.

**Test:** mirror `tests/tools/flow-workbench/viteConfig.smoke.test.ts` exactly — it guards against a
config typo that would make the npm script fail at import time, and the wesl plugin assertion is
load-bearing (`?static` imports do not resolve without it).

- [x] Invoke the `wesl-shaders` skill before writing `blit.wesl`.
- [x] Write the smoke test `exports a config with port 5500 and react + wesl plugins`; watch it fail.
- [x] Scaffold the files above. The viewport clears to a colour through the RenderGraph's HDR target
      + blit — no MCPM anything yet.
- [x] `npm run typecheck` → GREEN. `npm test -- mcpm-workbench` → GREEN.
- [x] Ask the user to open `npm run mcpm-workbench` (port 5500) and confirm a cleared canvas.
- [x] Commit: `feat(mcpm-workbench): scaffold the tool app, vite + wesl wiring`.

---

### T2: `specializeGridElement` — the f16/f32 one-code-path lever

**Files (create):** `tools/mcpm-workbench/src/sim/specializeGridElement.ts`,
`tools/mcpm-workbench/@types/GridElement.d.ts`,
`tests/tools/mcpm-workbench/sim/specializeGridElement.test.ts`.

**Interface — produces:**

```ts
export type GridElement = 'f16' | 'f32';

/** Rewrites `alias GridElem = f32;` and prepends `enable f16;` for the f16 build. */
export function specializeGridElement(wgsl: string, element: GridElement): string;
```

**Contract (spec §5, §15 decision 3):** the `.wesl` sources are authored with
`alias GridElem = f32;` so they stay valid standalone WGSL (the probe and editor tooling see real
code). The specialisation is a single-line textual rewrite of the **linked** WGSL string, applied
immediately before `createShaderModule`. Rejected and not to be reopened: `?link` runtime
conditional compilation — it buys exactly this at the cost of a runtime linker dependency the root
`wesl.toml` deliberately avoids.

**Test-first** (input strings are small hand-written WGSL fragments, not real shaders):

- [x] `f32 specialisation returns the input unchanged` — assert byte identity.
- [x] `f16 specialisation rewrites the GridElem alias` — output contains `alias GridElem = f16;` and
      no `= f32;` alias survives.
- [x] `f16 specialisation enables f16 exactly once, ahead of every declaration` — one occurrence of
      `enable f16;`, at an index before the first `alias`/`struct`/`@group` token. (WGSL requires
      `enable` directives before all declarations; a shader that violates it fails only at
      `createShaderModule`, so this test is the cheap gate.)
- [x] Implement; `npm test -- specializeGridElement` → GREEN.
- [x] Commit: `feat(mcpm-workbench): specialise the linked WGSL grid element at module-create time`.

---

### T3: `mcpm/` shader family base — constants, io, grid, rng

**Files (create):** `src/services/gpu/shaders/mcpm/constants.wesl`, `io.wesl`, `grid.wesl`,
`rng.wesl`.

**Source material — read before writing:** `~/Development/vendor/cpp/polyphorm/shaders/cs_agents_propagate.wgsl`
and `cs_field_decay.wgsl` for the binding declarations, workgroup shapes and RNG they share; the
addressing rationale is in that repo's `docs/superpowers/research/m2/wgsl-drafts/translation-notes.md`
and `docs/superpowers/research/m2/m2b-carryovers.md`.

**Contract (spec §4, §5):**

- `constants.wesl` — workgroup sizes, `N_HISTOGRAM_BINS = 17`, and the **quirk `override`
  declarations**, each defaulting to the fork's behaviour: `QUIRK_RNG_SEED_GUARD_TYPO`,
  the propagate dispatch truncation, and the `%`-wrap asymmetry in the 27-tap diffusion.
- `io.wesl` — `McpmUniforms` plus the agent (six `f32` SoA buffers: x, y, z, phi, theta, weight) and
  grid binding declarations. Grid buffers are `array<GridElem>`; `alias GridElem = f32;` is declared
  here so the file is valid standalone WGSL and T2's rewrite has exactly one line to hit.
- `grid.wesl` — voxel↔index (`index = z·W·H + y·W + x`, the fork's export order), **bounds-guarded**
  load/store, and manual trilinear (8 guarded loads + lerp). The guards are not defensive padding:
  the fork wraps sensing loads in bounds-check-and-zero helpers because Dawn/Metal *clamps* where
  D3D11 returned 0, and in a buffer port an out-of-range index is a silently wrong voxel rather than
  a clamp. This file is novel code — no trilinear-from-storage-buffer precedent exists in the repo.
- `rng.wesl` — two-word Marsaglia MWC plus `wang_hash` seeding, with the upstream seed-guard typo
  behind `QUIRK_RNG_SEED_GUARD_TYPO`.

**Tests:** none. Kernel numerics are validated statistically in Phase 3 (spec §12); a WGSL unit test
would need a GPU and would be weaker than the comparator.

- [x] Invoke the `wesl-shaders` skill. Note the no-backticks rule and the literal `package::` path
      requirement — these files are imported as `package::mcpm::grid` from both apps.
- [x] Read the two fork kernels and the m2 translation notes; port the shared declarations.
- [x] Confirm the family is picked up by the root `wesl.toml` glob with zero app-build cost
      (`wesl-plugin` is import-driven; nothing imports these yet).
- [x] `npm run typecheck` → GREEN (no TS touched; this is the no-regression check).
- [x] Commit: `feat(mcpm): shader family base — grid addressing, io, rng, quirk overrides`.

---

### T4: port `propagate.wesl`

**Files (create):** `src/services/gpu/shaders/mcpm/propagate.wesl`.

**Source:** `~/Development/vendor/cpp/polyphorm/shaders/cs_agents_propagate.wgsl`, with the port
diary at that repo's `docs/superpowers/research/m2/wgsl-drafts/cs_agents_propagate.wgsl` and
`m2/wgsl-drafts/translation-notes.md`.

**Contract (spec §5):** verbatim algorithm, transformed addressing — every texture load/store
becomes a `grid.wesl` buffer index and **nothing else changes**. Specifically preserved:

- sense (Maxwell-Boltzmann distance via inverse CDF) → probabilistic turn
  (`pow(max(deposit, 0), sharpness)`) → move (`move_distance · (0.1 + 0.9·distance_scaling_factor)`,
  floor-mod wrap) → EMA-weight rerouting respawn → **racy non-atomic float deposits**.
- The racy deposits stay **forever**, including past Phase 4's quirk strip. Neither D3D11 nor WebGPU
  has float atomics; the write contention is load-bearing Monte Carlo noise, not a bug.
- Data points are agents: indices `[0, n_data_points)` carry sentinel `theta = -5.0` and take the
  early-return deposit-only branch.
- Dispatch `[10,10,10]` workgroups of `(10, 10, grid_z)` with
  `grid_z = ((n_agents + n_data_points) / 100) / 1000` under integer truncation. Needs
  `maxComputeInvocationsPerWorkgroup ≥ 1000`; the workgroup shape is an `override` in the fork's
  port and stays one here.

**Tests:** none (see T3).

- [x] Invoke the `wesl-shaders` skill.
- [x] Read the fork kernel and its diary entry end to end before writing a line.
- [x] Port, re-addressing through `package::mcpm::grid`. Comment only the quirks and the addressing
      transform.
- [x] Commit: `feat(mcpm): port the agent propagate kernel to storage-buffer addressing`.

---

### T5: port `decay.wesl`

**Files (create):** `src/services/gpu/shaders/mcpm/decay.wesl`.

**Source:** `~/Development/vendor/cpp/polyphorm/shaders/cs_field_decay.wgsl`; diary at
`docs/superpowers/research/m2/wgsl-drafts/cs_field_decay.wgsl` +
`m2/wgsl-drafts/translation-notes.md` in that repo.

**Contract (spec §5):** 27-tap diffusion. The fork's DEFAULT weighting is its `all()` bug, behind
`QUIRK_DECAY_WEIGHT_ALL_INT3`: 19 of the 27 taps (centre + faces + edges) weigh 1.0 and only the 8
corners get `1/sqrt(3)`; quirk-OFF is the *intended* centre-only-1.0 kernel with
`1/sqrt(|dx| + |dy| + |dz|)` falloff elsewhere. The `%`-wrap asymmetry sits behind its own quirk
override; deposit × `decay_factor`; trace × `(0.985 + 0.01·rand)` per voxel behind
`QUIRK_DITHERED_TRACE_DECAY`. Dispatch `[8,8,8]` over `dims/8` with **no bounds tail** — this is
why every grid dimension must be a multiple of 8 (T7 enforces it). Deposit needs A/B ping-pong
because the 27-tap reads neighbours; trace decays in place.

**Tests:** none (see T3).

- [x] Invoke the `wesl-shaders` skill.
- [x] Read the fork kernel and diary entry.
- [x] Port; keep the explicit OOB guards from `grid.wesl` on every neighbour tap.
- [x] Commit: `feat(mcpm): port the field decay/diffusion kernel to storage-buffer addressing`.

---

### T6: catalog load — `loadCatalogPoints` and `catalogBounds`

**Files (create):** `tools/mcpm-workbench/src/field/loadCatalogPoints.ts`,
`tools/mcpm-workbench/src/field/catalogBounds.ts`,
`tools/mcpm-workbench/@types/CatalogPoints.d.ts`,
`tests/tools/mcpm-workbench/field/catalogBounds.test.ts`.

**Interface — produces:**

```ts
export type CatalogPoints = {
  /** Interleaved xyz, Mpc, observer-centred equatorial-cartesian. */
  readonly positions: Float32Array;
  readonly log10StellarMass: Float32Array;  // NaN where absent
  readonly count: number;
  readonly sources: readonly SourceType[];
};

export function loadCatalogPoints(
  sources: readonly SourceType[],
  tier: Tier,
): Promise<CatalogPoints>;

export function catalogBounds(positions: Float32Array): { min: Vec3; max: Vec3 };
```

**Interface — consumes (spec §6; all citations verified 2026-08-18):**
`loadDataManifest()` (`src/services/loading/dataManifest.ts:20-38` — memoized, never rejects) →
`tierFilenameForSource(source, tier)` (`src/data/tierTargets.ts:90-101`) → `dataUrl()` +
`fetchWithProgress()` (`src/services/loading/fetchWithProgress.ts:25-27`) →
`decodeGalaxyCatalog(buf)` (`src/data/galaxyCatalog/galaxyCatalogFormat.ts:235`, v9-only, throws
`FormatVersionError` otherwise). Sources with `tierTarget(source, tier) === 0` are excluded and
yield `emptyGalaxyCatalog()`. The load path is pure and store-free — no redux, no engine state.

The frame is observer-centred right-handed equatorial-cartesian
(`src/utils/math/raDecZToCartesian.ts:1-17`; +x → RA 0/Dec 0, +z → celestial north), so the observer
sits at the origin and the export sidecar declares `frame: 'equatorial-cartesian'`.

No bbox or multi-source merge helper exists in the repo; write plain typed-array reductions in the
style of `src/utils/galaxy/galaxyMedianAbsMag.ts`.

**Test-first** — `catalogBounds` only (`loadCatalogPoints` is network + decode plumbing over already
tested seams; a fetch-mocked test would test the mock):

- [x] `catalogBounds returns per-axis min and max over interleaved xyz` — a hand-written 4-point
      array whose min/max differ per axis, asserted against hand-computed values.
- [x] `catalogBounds ignores nothing — a single point yields min === max` (guards the reduce-seed
      bug where an empty accumulator leaves ±Infinity in one axis).
- [x] Implement both files; `npm test -- catalogBounds` → GREEN.
- [x] Commit: `feat(mcpm-workbench): load v9 catalogs over the runtime boot path`.

---

### T7: `autoFitGridBox` and the world↔grid affine

**Files (create):** `tools/mcpm-workbench/src/field/autoFitGridBox.ts`,
`tools/mcpm-workbench/src/field/worldToVoxel.ts`, `tools/mcpm-workbench/src/field/voxelToWorld.ts`,
`tools/mcpm-workbench/@types/GridBox.d.ts`,
`tests/tools/mcpm-workbench/field/autoFitGridBox.test.ts`,
`tests/tools/mcpm-workbench/field/worldToVoxel.test.ts`.

**Interface — produces:**

```ts
export type GridBox = {
  readonly centerMpc: Vec3;
  readonly sizeMpc: Vec3;        // dims × voxelSizeMpc, exactly
  readonly dims: Vec3;           // each a multiple of 8
  readonly voxelSizeMpc: number; // cubic, by construction
};

export function autoFitGridBox(
  bounds: { min: Vec3; max: Vec3 },
  longAxisTarget: number,
  paddingMpc: number,
): GridBox;

export function worldToVoxel(box: GridBox, p: Vec3): Vec3;
export function voxelToWorld(box: GridBox, v: Vec3): Vec3;
```

**Contract (spec §6, §15 decision 2) — the invariant this whole task exists to protect:**
**voxels are cubic and the box absorbs the rounding**, not the other way round.
`voxelSizeMpc = longestPaddedExtent / longAxisTarget`, then `dims_i = ceil8(extent_i / voxelSizeMpc)`
and `sizeMpc_i = dims_i · voxelSizeMpc`. Rounding dims up while pinning the box would make per-axis
voxel sizes differ by up to 1.1% at a 728 axis, which **fails `buildRhizomeVolume`'s 0.5% spread
assert** — the export would reject at the last step of a multi-hour fit. Growing the box costs a
shell of empty voxels and keeps the spread at exactly zero.

Multiple-of-8 dims are required because `decay.wesl` dispatches `dims/8` with no bounds tail. The
manual override takes **center + size + long-axis resolution, never free dims**, so the cubic
invariant cannot be typed away — express that by making the override construct a `GridBox` through
the same code path, not by widening the type.

`origin_mpc` for the sidecar is the lower corner of voxel (0,0,0): `center − dims · voxelSize / 2`.

**Test-first:**

- [x] `auto-fit gives every axis a multiple-of-8 dimension` — an asymmetric bbox with hand-computed
      dims.
- [x] `auto-fit keeps the voxel size identical on all three axes` — `sizeMpc[i] / dims[i]` equal
      across i to exact float equality. This is the property the importer's spread assert depends on.
- [x] `auto-fit grows the box so sizeMpc equals dims × voxelSize` — assert both, hand-computed.
- [x] `the manual override at a long-axis resolution still yields cubic voxels` — a hand-picked
      centre/size/resolution triple.
- [x] `a point at a known Mpc position lands at a hand-computed voxel index` — pick a box whose
      origin and voxel size make the arithmetic checkable on paper.
- [x] `voxelToWorld ∘ worldToVoxel returns the original position at voxel centres` — round trip.
      (Round trip, not a mirror: the two functions are independent inverses, not the same formula.)
- [x] Implement; `npm test -- autoFitGridBox worldToVoxel` → GREEN.
- [x] Commit: `feat(mcpm-workbench): auto-fit a cubic-voxel grid box from the catalog bbox`.

---

### T8: `deriveAgentWeights`

**Files (create):** `tools/mcpm-workbench/src/field/deriveAgentWeights.ts`,
`tools/mcpm-workbench/@types/AgentWeights.d.ts`,
`tests/tools/mcpm-workbench/field/deriveAgentWeights.test.ts`.

**Interface — produces:**

```ts
export type AgentWeights = {
  readonly weights: Float32Array;     // per data point, post-transform
  readonly nanCount: number;
  readonly medianLog10Mass: number;
};

export function deriveAgentWeights(
  log10StellarMass: Float32Array,
  mode: 'stellarMass' | 'uniform',
): AgentWeights;
```

**Contract (spec §6, §15 decision 8) — order is verbatim from the fork:** NaN entries take the
finite median → `w = log10(1 + max(W, 0))` → divide by the mean of `w` → scale by `1e6 / n_points`.
The `max(W, 0)` clamp guards the domain: `log10StellarMass` runs ~8–12 in practice so it never
bites, but a sentinel leaking through would produce NaN weights that poison every deposit
(`project_catalog_magnitude_sentinels` — sentinels pass `isFinite`).

Median fill rather than exclusion (Q9): geometry is most of what MCPM uses, and silently dropping
galaxies makes catalog-to-catalog comparisons lie. Because the fill is invisible in the output,
**the HUD shows the NaN count and fraction at all times** (T11) — it is the one number that says
what the fit stands on.

**Test-first:**

- [x] `NaN masses take the finite median with an odd finite count` — hand-computed median.
- [x] `NaN masses take the finite median with an even finite count` — mean of the two middles.
- [x] `nanCount reports how many entries were filled`.
- [x] `weights average 1e6 / n after normalisation` — assert the mean of `weights`, hand-derived
      from the two-step normalisation, not recomputed with the source's expression.
- [x] `uniform mode ignores mass entirely` — an input with wildly varying finite masses and some
      NaN yields all-equal weights.
- [x] Implement; `npm test -- deriveAgentWeights` → GREEN.
- [x] Commit: `feat(mcpm-workbench): derive agent weights from v9 stellar mass with median fill`.

---

### T9: sim harness — buffers, preflight, agent seeding, step encoding

**Files (create):** `tools/mcpm-workbench/src/sim/createMcpmHarness.ts`,
`src/sim/createGridBuffers.ts`, `src/sim/planGridBudget.ts`, `src/sim/seedAgents.ts`,
`src/sim/encodeStep.ts`, `tools/mcpm-workbench/@types/McpmHarness.d.ts`,
`@types/McpmParams.d.ts`, `@types/AgentInitMode.d.ts`, `@types/GridBudget.d.ts`,
`tests/tools/mcpm-workbench/sim/planGridBudget.test.ts`.
**Depends on:** P1, T2, T3, T4, T5, T6, T7, T8.

**Interface — produces:**

```ts
export type AgentInitMode = 'aroundData' | 'uniform';

export type McpmParams = {
  readonly senseSpreadDeg: number;      // SDSS-VAC preset: 20
  readonly senseDistanceMpc: number;    // 4.6
  readonly turnAngleDeg: number;        // 10
  readonly moveDistanceMpc: number;     // 0.1
  readonly depositValue: number;        // 0 — data-driven
  readonly persistence: number;         // 0.8 (the fork's decay_factor)
  readonly sharpness: number;           // 2.5
  readonly normalizationFactor: number; // 1.0
};

export type GridBudget = {
  readonly perBufferBytes: Readonly<Record<'depositA' | 'depositB' | 'trace' | 'agents', number>>;
  readonly totalBytes: number;
  /** null when the configuration fits; otherwise names the offending buffer. */
  readonly refusal: {
    readonly buffer: string;
    readonly requestedBytes: number;
    readonly limitBytes: number;
    readonly maxLongAxis: number;
  } | null;
};

export function planGridBudget(
  box: GridBox,
  agentCount: number,
  element: GridElement,
  limits: Pick<GPUSupportedLimits, 'maxBufferSize' | 'maxStorageBufferBindingSize'>,
): GridBudget;

export type McpmHarness = {
  readonly element: GridElement;
  readonly box: GridBox;
  /** Queues one propagate + decay pair and advances the step counter. */
  step(params: McpmParams): void;
  /** Zeroes the trace grid only; agents and deposit survive. */
  clearTrace(): void;
  /** Re-seeds agents and zeroes every grid; resets the step counter. */
  reset(mode: AgentInitMode, seed: number): void;
  dispose(): void;
};

export function createMcpmHarness(opts: {
  readonly canvas: HTMLCanvasElement;
  readonly points: CatalogPoints;
  readonly weights: AgentWeights;
  readonly box: GridBox;
  readonly agentCount: number;
  readonly initMode: AgentInitMode;
  readonly seed: number;
}): Promise<McpmHarness>;
```

**Contract:**

- **Device request (spec §5), verbatim:**

  ```ts
  const gpu = await initGpu(canvas, {
    requiredFeatures: ['shader-f16'],
    requiredLimits: {
      maxComputeInvocationsPerWorkgroup: 1024,  // propagate's 10×10×10 = 1000
      maxBufferSize: Number.MAX_SAFE_INTEGER,   // clamped to the adapter's max by P1
      maxStorageBufferBindingSize: Number.MAX_SAFE_INTEGER,
    },
  });
  ```

  Asking for everything and taking what the adapter gives is only safe because P1 clamps rather than
  throws. `device.features.has('shader-f16')` **alone** selects `GridElement` — no user toggle, so
  the flag and the device cannot disagree.

- **Buffers (spec §5 table):** deposit A/B and trace as `array<GridElem>`; agents as six `f32` SoA
  buffers of length `n_agents + n_data_points`; histogram as 17 × `atomic<u32>` (16 count bins + running max at index 16).
- **Preflight:** `planGridBudget` runs before any allocation and refuses by name, reporting the
  largest long-axis resolution that would fit. WebGPU exposes no total-memory limit, only per-buffer
  ones, so the total is reported for the human to judge (T11's HUD), never enforced.
- **Agent count steps in units of 100,000** (spec §5, §15 decision 9) — that makes the propagate
  dispatch truncation unobservable while its quirk flag is on. Enforce at the seeder, not only at
  the UI control.
- **`seedAgents`** builds both init modes: `aroundData` scatters agents at random data points with
  random orientation; `uniform` scatters them uniformly through the box. Indices
  `[0, n_data_points)` are the data points themselves, carrying `theta = -5.0` and their weight.
- Module creation goes through `makeShaderFactory(device)` (the flow-workbench wrapper over
  `createShaderModuleWithDevLog`, `src/services/gpu/shaderCompileLogger.ts:25`), with
  `specializeGridElement` applied to the linked string first.
- Bind-group layouts are **explicit**, never `'auto'` (`feedback_webgpu_auto_layout_trap`).

**Test-first** — `planGridBudget` only; the rest needs a GPU and is gated by the probe (T12):

- [x] `budgets a 712×1200×728 f16 grid at 1.24 GB per grid buffer` — hand-computed from
      `712·1200·728·2` bytes; the number the spec's §5 table states, recomputed independently.
- [x] `refuses by naming the first buffer that exceeds maxBufferSize` — assert `refusal.buffer` and
      `refusal.limitBytes` against a small fake limits object.
- [x] `reports the largest long-axis resolution that would fit` — hand-computed for a cube at a
      given limit.
- [x] Implement the whole harness. `npm run typecheck` → GREEN, `npm test -- planGridBudget` → GREEN.
- [x] Commit: `feat(mcpm-workbench): sim harness — specialised grid buffers, preflight, agent seeding`.

---

### T10: trace raymarch view

**Files (create):** `src/services/gpu/shaders/mcpm/vertex.wesl`,
`src/services/gpu/shaders/mcpm/fragment.wesl`, `tools/mcpm-workbench/src/render/tracePass.ts`,
`tools/mcpm-workbench/src/render/uploadPaletteLut.ts`.
**Files (modify):** `tools/mcpm-workbench/src/render/RenderGraph.ts`.
**Depends on:** T3, T9.

**Source for the transfer function:** `~/Development/vendor/cpp/polyphorm/shaders/ps_volume_trace.wgsl`
(+ `vs_2d.wgsl` for the fullscreen triangle); the render-path reasoning is in that repo's
`docs/superpowers/research/m3/render-path-design.md`.

**Contract (spec §7, §15 decision 6):**

- `vertex.wesl` is the fullscreen triangle shared by the raymarch and the blit passes.
- `fragment.wesl` marches the sim buffer **directly** through `grid.wesl`'s manual trilinear (8 loads
  + lerp). No per-frame copy, no packing. The runtime `scalarVolume` renderer is **not** reusable:
  it is `texture_3d<f32>` + `textureSampleLevel` and eats packed SCFD.
- Transfer function is Polyphorm's: remap `r = 1 - exp(-t)`, colour from the palette at `r`, alpha
  `= opticalThickness · r`.
- **Palette:** `buildPaletteLut(id)` (`src/data/volume/scalarFieldPalettes.ts:63`) supplies a
  256-entry RGBA8 LUT, uploaded as a 256×1 `rgba8unorm` texture — no bundled `.tga`. Only the LUT's
  **RGB** is used; alpha stays Polyphorm's `opticalThickness · r`, because the LUT's baked opacity
  ramp is tuned for the runtime's presentation and would make the workbench's image incomparable to
  fork screenshots.
- **New render targets need a frame-program step** or the pass is never opened, silently
  (`project_render_target_needs_frame_program_step`) — the tool's `RenderGraph` is the equivalent
  wiring point here; make sure the trace pass is registered, not merely constructed.
- Camera: a tool-local orbit camera in the `view` slice (T11), following flow-workbench's camera
  slice. The runtime `OrbitCamera` is not imported — the tool's box is in Mpc with no scale ladder.

**Tests:** none (visual). The gate is the probe (T12) plus the human check in T13.

- [x] Invoke the `wesl-shaders` skill. Read `input.pos` from the vertex-output struct — a duplicate
      `@builtin(position)` fails only at runtime (`project_wesl_duplicate_builtin_position_runtime_only`).
- [x] Read the fork's `ps_volume_trace.wgsl` before writing the transfer function.
- [x] Implement, register the pass in the RenderGraph, wire the palette upload.
- [x] Ask the user to look: with the sim stepping, the viewport shows a trace field that sharpens.
- [x] Commit: `feat(mcpm): raymarch the trace grid straight out of the storage buffer`.

---

### T11: store, controls, HUD

**Files (create):** `tools/mcpm-workbench/src/state/createStore.ts`, `src/state/useStore.ts`,
`src/state/slices/catalogSlice.ts`, `gridSlice.ts`, `simSlice.ts`, `viewSlice.ts`,
`tools/mcpm-workbench/src/ui/ControlsPanel.tsx`, `src/ui/Slider.tsx`, `src/ui/Toggle.tsx`,
`src/ui/Hud.tsx`, `src/ui/GridBoxPanel.tsx`, `tools/mcpm-workbench/@types/AppState.d.ts` +
one file per slice type.
**Files (modify):** `tools/mcpm-workbench/src/ui/App.tsx`, `src/main.tsx`.
**Files (create, test):** `tests/tools/mcpm-workbench/state/simSlice.test.ts`.
**Depends on:** T6, T7, T8, T9.
**Template:** `tools/flow-workbench/src/state/*` — hand-rolled observable store, typed slices, React
binding via `useSyncExternalStore`, immutable updates. **No redux, no react-redux** (spec §10); the
tool is outside `src/state`'s regime entirely.

**Slices (spec §10):**

| slice       | holds                                                                                |
| ----------- | ------------------------------------------------------------------------------------ |
| `catalog`   | selected sources + tier, load status, point count, NaN-fill count, weight mode        |
| `grid`      | `GridBox`, auto-fit vs manual, long-axis target, resolved `GridElement`, byte budget   |
| `sim`       | `McpmParams`, agent count, agent-init mode, running/paused, step counter, seed         |
| `view`      | active mode, camera, raymarch params, path-tracer params                               |

(The `histogram` slice arrives with T20.)

**UI contract:**

- Sliders for the eight `McpmParams` fields, starting at the SDSS-VAC preset values above.
- Run controls: pause, resume, reset, trace-only clear; agent count 1M–10M **stepping in 100k units**.
- HUD shows, at all times: point count, **NaN-fill count and fraction**, resolved `GridElement`,
  the summed byte budget, and the step counter.
- `GridBoxPanel` offers auto-fit and the manual override (center + size + long-axis resolution —
  never free dims).
- `Slider` / `Toggle` are tool-local (flow-workbench has its own pair). Promoting them to
  `src/components/common/` is a standing backlog item, not this PR's business.
- The React layer imports no GPU; it talks to `McpmHarness` and the store only.
- Chrome comes from `src/styles/global.css` tokens, as the sibling tools do.

**Test-first** — the one slice behaviour a compiler cannot catch:

- [x] `setAgentCount snaps to the nearest 100k unit` — assert 1_050_000 → 1_000_000 and the clamp to
      the 1M–10M range at both ends. (This is not a clamp-boundary test: the snap is a real
      transform whose absence would silently freeze a tail of the swarm.)
- [x] Implement store + UI; `npm test -- simSlice` → GREEN; `npm run typecheck` → GREEN.
- [x] Ask the user to look: sliders move, HUD numbers populate, pause/resume/reset/clear respond.
- [x] Commit: `feat(mcpm-workbench): store, parameter controls, and the diagnostic HUD`.

---

### T12: headless GPU probe

**Files (create):** `tools/mcpm-workbench/probeGpuErrors.ts`,
`tools/mcpm-workbench/src/field/syntheticCatalog.ts`.
**Files (modify):** `package.json`, `tools/mcpm-workbench/src/main.tsx` (the `?probe` hook).
**Depends on:** T9, T10, T11.
**Template — read it, do not reinvent:** `tools/galaxy-renderer/probeGpuErrors.ts`.

**Contract (spec §11):** own ephemeral-port Vite server; real `chromium` channel first with a
headless-shell fallback (`--enable-unsafe-webgpu --use-angle=metal`); an `addInitScript` that
monkey-patches `requestDevice` to capture `uncapturederror` and `device.lost` (ignoring reason
`'destroyed'`); a step queue; six settle frames; an error drain; non-zero exit on any failure.

Its step queue drives: load a **synthetic** catalog (plan-authored decision 6 — a few thousand
deterministic points generated in-tool, reached via `?probe`, so the gate never touches the network
or `public/data`), allocate a small grid, run every pass once in each view mode available at the
time this task runs (Phase 1: raymarch only; Track V tasks each extend the queue).

`package.json` gains `"mcpm-workbench:probe": "tsx tools/mcpm-workbench/probeGpuErrors.ts"`.

**Tests:** the probe *is* the test.

- [x] Read the galaxy-renderer probe end to end; copy its structure, not its content.
- [x] Never edit a `.wesl` file while a probe is running (`feedback_probe_in_background`).
- [x] `npm run mcpm-workbench:probe` → exit 0 with no captured WebGPU errors.
- [x] Commit: `feat(mcpm-workbench): headless GPU error probe`.

---

### T13: Phase 1 gate

**Files (modify):** `tools/mcpm-workbench/README.md`.
**Depends on:** T1–T12. **No new code** — this is the spec §13 Phase 1 exit criteria, checked.

- [x] `npm run mcpm-workbench` serves on 5500; SDSS + 2MRS + GLADE v9 tiers load, and the HUD shows
      point count, NaN-fill count and fraction, resolved `GridElement`, and the summed byte budget.
- [x] Grid auto-fits from the catalog bbox; the manual override changes the box; an over-budget
      configuration is refused **by name** rather than crashing the tab.
- [x] A ≥300-class grid runs continuously; the trace visibly sharpens into filaments over a few
      hundred steps, and sense distance / turn angle / persistence / sharpness each change the image
      in the expected direction. **Ask the user to confirm this visually** — it is the criterion no
      automated gate covers.
- [x] Pause, resume, reset, and trace-only clear behave; the agent-count control steps in 100k units.
- [x] `npm run mcpm-workbench:probe` exits 0.
- [x] `npm test -- mcpm-workbench` covers auto-fit, world↔grid, and weights, all GREEN.
- [x] Write the README: what the tool is, how to run it, the port, the probe, the known limits.
      Leave the validation-band section as a stub for T23.
- [x] Commit: `docs(mcpm-workbench): README and Phase 1 gate`.

---

# Phase 2 — export legs

Both legs from one readback (spec §8). Exit criteria are Task 19.

### T14: `writeNpy` — the repo's first `.npy` writer

**Files (create):** `tools/parsers/npyWriter.ts`, `tests/parsers/npyWriter.test.ts`.
**Parallel with:** T15.

**Interface — produces (spec §8, §15 decision 5):**

```ts
// mirrors readNpy (tools/parsers/npyReader.ts:34)
export function writeNpy(
  values: Uint16Array | Float32Array | Float64Array,
  shape: readonly number[],
  dtype: '<f2' | '<f4' | '<f8',
): ArrayBuffer;
```

NumPy format v1.0 header, C-order, little-endian — the exact subset `readNpy` accepts. A
`Uint16Array` with dtype `'<f2'` is raw f16 bits, matching how `readNpy` returns them.

**Test-first** (on-disk format contract — a keep-rule class under `testing.md`):

- [x] `writeNpy → readNpy round trips <f4 values through a non-cubic shape` — shape `[2, 3, 4]` so an
      axis-order slip is visible.
- [x] `writeNpy → readNpy round trips <f2 bits` — a `Uint16Array` in, the same bits out.
- [x] `the v1.0 header pads the data start to a 64-byte boundary` — NumPy's own requirement; a
      writer that ignores it produces files third-party readers reject even though `readNpy` accepts
      them. Assert the byte offset, hand-computed.
- [x] Implement; `npm test -- npyWriter` → GREEN.
- [x] Commit: `feat(parsers): writeNpy — NumPy v1.0 writer mirroring npyReader`.

---

### T15: `readbackTrace`

**Files (create):** `tools/mcpm-workbench/src/sim/readbackTrace.ts`,
`tools/mcpm-workbench/@types/TraceReadback.d.ts`.
**Files (modify):** `tools/mcpm-workbench/src/sim/createMcpmHarness.ts` (expose it on the handle).
**Parallel with:** T14.

**Interface — produces (spec §8):**

```ts
export type TraceReadback = {
  readonly data: Uint16Array | Float32Array;  // f16 bits, or f32 when the grid is f32
  readonly element: GridElement;
  readonly dims: Vec3;
};

/** On McpmHarness. */
readbackTrace(): Promise<TraceReadback>;
```

Copy the trace buffer to a `MAP_READ` staging buffer and map it. At 1.24 GB the staging buffer is
itself limit-bound — reuse `planGridBudget`'s numbers to refuse before allocating, with the same
by-name message.

**Tests:** none (GPU). Covered by the probe once T18 wires a preview step.

- [x] Implement; `npm run typecheck` → GREEN.
- [x] Commit: `feat(mcpm-workbench): read the trace grid back to the CPU`.

---

### T16: `.npy` + sidecar download pair

**Files (create):** `tools/mcpm-workbench/src/export/emitTraceSidecar.ts`,
`src/export/exportNpy.ts`, `src/export/downloadStem.ts`, `src/export/triggerDownload.ts`,
`tests/tools/mcpm-workbench/export/emitTraceSidecar.test.ts`.
**Files (modify):** `tools/mcpm-workbench/src/ui/ControlsPanel.tsx`.
**Depends on:** T14, T15, T7. **Parallel with:** T17, T18.

**Interface — produces:**

```ts
export function emitTraceSidecar(input: {
  readonly box: GridBox;
  readonly points: CatalogPoints;
  readonly weights: AgentWeights;
  readonly tier: Tier;
  readonly params: McpmParams;
  readonly agentCount: number;
  readonly steps: number;
  readonly seed: number;
  readonly producedAt: Date;
}): string;  // JSON text

/** `mcpm-<yyyymmdd-hhmm>` — one stem names both files so the pair cannot drift apart. */
export function downloadStem(now: Date): string;
```

**Wire format (spec §8) — `polyphy-trace` v1 verbatim, keys stay snake_case; the parser that must
accept it is `parsePolyphyTraceSidecar` (`tools/parsers/polyphyTraceSidecar.ts:52`):**

```json
{
  "format": "polyphy-trace",
  "version": 1,
  "dims": [712, 1200, 728],
  "origin_mpc": [-356.0, -600.0, -364.0],
  "voxel_size_mpc": [1.0, 1.0, 1.0],
  "frame": "equatorial-cartesian",
  "value_units": "mcpm-trace-density",
  "provenance": {
    "producer": "mcpm-workbench",
    "produced_at": "2026-08-18T14:02:11+0200",
    "catalog": { "sources": ["sdss", "2mrs", "glade"], "tier": "large",
                 "n_points": 1642391, "nan_mass_filled": 20114 },
    "params": { "senseSpreadDeg": 20, "senseDistanceMpc": 4.6, "turnAngleDeg": 10,
                "moveDistanceMpc": 0.1, "depositValue": 0, "persistence": 0.8,
                "sharpness": 2.5, "normalizationFactor": 1.0 },
    "n_agents": 10000000,
    "steps": 5000,
    "seed": 12345
  }
}
```

`voxel_size_mpc` is written as three **equal** numbers because T7 makes it exactly cubic; the
importer's 0.5% spread assert then passes with no margin consumed. **No git commit rides the
provenance** — the browser cannot know it (§15 decision 10). Filenames default to
`mcpm-<yyyymmdd-hhmm>.npy` / `.json` from one stem.

**Test-first:**

- [x] `emitTraceSidecar → parsePolyphyTraceSidecar round trips every field` — including the
      snake_case hop and the nested provenance.
- [x] `a sidecar built from an autoFitGridBox box passes the importer 0.5% voxel-size spread rule` —
      feed a real `autoFitGridBox` output through `emitTraceSidecar` and `parsePolyphyTraceSidecar`.
      This is the cross-file contract T7's invariant exists for.
- [x] Implement; wire the download button to write `.npy` (via `writeNpy` on the readback) and
      `.json` from one stem.
- [x] `npm test -- emitTraceSidecar` → GREEN.
- [x] Commit: `feat(mcpm-workbench): export the .npy + polyphy-trace sidecar pair`.

---

### T17: in-browser `.scfd` export

**Files (create):** `tools/mcpm-workbench/src/export/exportScfd.ts`,
`tools/mcpm-workbench/src/export/widenTrace.ts`.
**Files (modify):** `tools/mcpm-workbench/src/ui/ControlsPanel.tsx`.
**Depends on:** P2, T15. **Parallel with:** T16, T18.

**Contract (spec §8 leg 2):** `packLogTraceVoxels` (post-P2, `src/utils/volume/packLogTraceVoxels.ts`)
→ `encodeScalarField` (`src/data/volume/scalarFieldFormat.ts:119`) with `channels = 1`, identity
rotation, `frameKind = 'equatorial-cartesian'`, origin and voxel size from the grid box. Downloads
directly. Same packing code as leg 1's importer, so the two outputs are diffable — the whole reason
both exist.

**Landmine:** `packLogTraceVoxels` takes `Float32Array | Float64Array`, but an f16 readback is a
`Uint16Array` of raw bits. Widen through **`src/utils/math/f16ToFloat.ts`** — the browser-side
decoder. Do **not** import `tools/utils/math/f16BitsToFloat.ts`; it is the same decoder on the wrong
side of the `src`/`tools` line, and the duplication is a known, backlogged finding (spec §3 adjacent
finding). `src/utils/math/f16ToFloatLut.ts` exists if the per-element call proves slow at 622M
voxels; measure before switching.

**Tests:** none new. `packLogTraceVoxels` and `encodeScalarField` have their own coverage and the
in-browser path adds no logic (spec §12). The gate is T19's decode comparison.

- [x] Implement `widenTrace` (one function, one file) and `exportScfd`.
- [x] `npm run typecheck` → GREEN.
- [x] Commit: `feat(mcpm-workbench): export .scfd directly from the browser`.

---

### T18: preview-export view

**Files (create):** `tools/mcpm-workbench/src/export/previewPackedTrace.ts`.
**Files (modify):** `tools/mcpm-workbench/src/render/tracePass.ts`, `src/state/slices/viewSlice.ts`,
`tools/mcpm-workbench/probeGpuErrors.ts` (step queue).
**Depends on:** P2, T15, T17. **Parallel with:** T16.

**Contract (spec §7):** on demand, **not per frame** — pack the current trace through the real
`packLogTraceVoxels` and display the packed cube once. This is the only view that exercises pipeline
code, which is the point: it catches a packing or transpose regression before the export leaves the
tab. Upload the packed `Uint16Array` as a grid the raymarch fragment can sample, and mark the view
stale on the next sim step rather than repacking.

**Tests:** none (visual). The probe gains a step that enters the mode once.

- [x] Implement; add the probe step; `npm run mcpm-workbench:probe` → exit 0.
- [x] Commit: `feat(mcpm-workbench): preview the packed export against the live trace`.

---

### T19: Phase 2 gate

**Files (modify):** `tools/mcpm-workbench/README.md`. **No new code** — spec §13 Phase 2 exit criteria.

- [x] The `.npy` + sidecar pair downloads, and
      `npx tsx tools/volumes/buildRhizomeVolume.ts <file>.npy --out /tmp/x.scfd` succeeds on it
      untouched apart from P3.
- [x] The in-browser `.scfd` decodes with `decodeScalarField` and agrees with the importer's output
      from the same run within f16 rounding. Record the observed max deviation in the README.
- [x] The preview-export view renders the packed cube and matches the live raymarch in structure
      (ask the user to look).
- [x] `npm test -- npyWriter emitTraceSidecar buildRhizomeVolume` → GREEN.
- [x] Commit the README update: `docs(mcpm-workbench): Phase 2 gate — export legs verified`.

---

# Phase 3 — validation

The anchor is the VAC trace on the maintainer path: `data/raw/mcpm/trace.bin` (712×1200×728,
headerless f16, `index = z·W·H + y·W + x`) plus `data/raw/mcpm/export_metadata.txt`. **Both are
gitignored maintainer downloads** — `data/raw/mcpm/` contains only `README.md` in a fresh checkout,
so T23 begins by acquiring them. Announce the download size to the user before fetching
(`feedback_announce_big_downloads`).

### T20: density histogram and the live convergence signal

**Files (create):** `src/services/gpu/shaders/mcpm/histogram.wesl`,
`tools/mcpm-workbench/src/ui/HistogramPlot.tsx`,
`tools/mcpm-workbench/src/state/slices/histogramSlice.ts`,
`tools/mcpm-workbench/@types/HistogramSlice.d.ts`.
**Files (modify):** `tools/mcpm-workbench/src/sim/encodeStep.ts`, `src/ui/ControlsPanel.tsx`.
**Parallel with:** T21, T22.

**Source:** `~/Development/vendor/cpp/polyphorm/shaders/cs_density_histo.wgsl`; the histogram's role
is discussed in that repo's `docs/superpowers/research/m2/m2b-carryovers.md`.

**Contract (spec §5, §9, §15 decision 7):** 17 bins (`N_HISTOGRAM_BINS`), an `atomic<u32>` add/max
buffer, guarded `idx < n_data_points`, optional jittered-sampling toggle. The scalar convergence
signal **`meanLogTraceAtPoints` is defined by this project, not the fork** — the fork's kernel only
bins. Derive it from the same per-data-point trace samples the histogram bins, so the in-UI curve
and the comparator's statistic mean the same thing.

`HistogramPlot` is a small canvas drawing the 17 bins plus the `meanLogTraceAtPoints` time series.

**Tests:** none new (GPU kernel; spec §12 defers kernel numerics to the statistical validation).

- [x] Invoke the `wesl-shaders` skill; read the fork kernel.
- [x] Port; wire the readback into the `histogram` slice; draw the plot.
- [x] Add a probe step that runs the histogram pass; `npm run mcpm-workbench:probe` → exit 0.
- [x] Commit: `feat(mcpm): density histogram kernel and the live convergence plot`.

---

### T21: dev-only packed-catalog loader

**Files (create):** `tools/mcpm-workbench/src/field/loadPackedCatalog.ts`,
`tests/tools/mcpm-workbench/field/loadPackedCatalog.test.ts`.
**Files (modify):** `tools/mcpm-workbench/src/ui/App.tsx` (drag-drop target).
**Parallel with:** T20, T22.

**Interface — produces:**

```ts
/** Parses the fork's flat f32 [X, Y, Z, W] .bin plus its metadata txt. */
export function loadPackedCatalog(
  bin: ArrayBuffer,
  metadataText: string,
): { points: CatalogPoints; declaredCount: number; declaredMeanWeight: number };
```

**Contract (spec §9):** gated on `import.meta.env.DEV`, drag-drop only. Weights take the packed
file's `W` through **the same `deriveAgentWeights` transform as §6** — do not fork the maths.
This is the **only** concession to the Polyphorm packed format; Q2's "no packed loader" deferral
said "until validation day", and this is it.

**Why it exists:** the VAC trace was fitted to the packed VAC catalog — 324,901 points with the
VAC's own cuts — which skymap's SDSS bin (970k points, different cuts) is not. Validation needs the
same input the anchor had.

**Test-first** (a parser against fixture bytes — a keep-rule class):

- [x] `parses a flat f32 [X, Y, Z, W] buffer into interleaved positions and weights` — a
      three-point hand-built `ArrayBuffer` with hand-computed expectations.
- [x] `rejects a buffer whose length disagrees with the metadata count` — the guard that catches a
      truncated download, which is otherwise a silently short catalog.
- [x] Implement; `npm test -- loadPackedCatalog` → GREEN.
- [x] Commit: `feat(mcpm-workbench): dev-only loader for the fork's packed catalogs`.

---

### T22: comparator CLI

**Files (create):** `tools/mcpm-workbench/validate/compareTraceCubes.ts`,
`validate/readTraceCube.ts`, `validate/traceHistogram.ts`, `validate/dataPointHistogram.ts`,
`validate/axisMarginals.ts`, `validate/totalVariation.ts`,
`tools/mcpm-workbench/@types/TraceStats.d.ts`,
`tests/tools/mcpm-workbench/validate/compareTraceCubes.test.ts`.
**Files (modify):** `package.json`.
**Parallel with:** T20, T21.

**Interface — produces (spec §9):**

```ts
export type TraceStats = {
  readonly logHistogram: Float64Array;        // fixed edges over log(1+trace), all voxels
  readonly dataPointHistogram: Float64Array;  // 17 bins, the fork's N_HISTOGRAM_BINS
  readonly marginals: readonly [Float64Array, Float64Array, Float64Array];
  readonly meanLogTraceAtPoints: number;
};

export function totalVariation(a: Float64Array, b: Float64Array): number;
export function axisMarginals(values: Float64Array, dims: Vec3): TraceStats['marginals'];
```

**CLI (spec §9, extended by plan-authored decision 4):**

```
npx tsx tools/mcpm-workbench/validate/compareTraceCubes.ts \
  --a data/raw/mcpm/trace.bin --b ~/Downloads/mcpm-20260818.npy \
  --dims 712,1200,728 --meta data/raw/mcpm/export_metadata.txt \
  --points <packed-catalog.bin> [--bins 17] [--json out.json]
```

`--dims` describes the **headerless `.bin` inputs only**; a `.npy` carries its own shape and dtype,
and a mismatch between the two sides is a hard error. `--meta` supplies the origin and voxel size a
headless `.bin` cannot carry, so data points can be mapped into voxels; on the `.npy` side those
come from its same-basename sidecar. `package.json` gains
`"mcpm-workbench:compare": "tsx tools/mcpm-workbench/validate/compareTraceCubes.ts"`.

**Reported comparison:** **total-variation distance** between each normalised histogram pair, and
max relative deviation per axis marginal. TV distance because it is bounded in `[0,1]`, needs no
bin-count tuning, and does not blow up on empty bins the way χ² or KL does — the low-density tail is
nearly all empty. **Exact acceptance bands are not set here**; they are an output of T23.

**Test-first** (constructed cubes, hand-computed expectations):

- [x] `total variation is 0 for identical histograms`.
- [x] `total variation is 1 for disjoint supports`.
- [x] `total variation on a two-bin case matches the hand-computed value` — e.g. `[0.7, 0.3]` vs
      `[0.4, 0.6]` → `0.3`.
- [x] `axisMarginals put all mass in the hot plane's bin` — a cube with one non-zero plane.
- [x] `compareTraceCubes errors when a .npy shape disagrees with --dims` — assert the throw.
- [x] Implement; `npm test -- compareTraceCubes` → GREEN.
- [x] Commit: `feat(mcpm-workbench): trace-cube comparator CLI`.

---

### T23: Phase 3 gate — the measured noise floor

**Files (modify):** `tools/mcpm-workbench/README.md`. **Depends on:** T20, T21, T22.
No new code — spec §13 Phase 3 exit criteria. This task is a **measurement**, and the temptation it
must resist is picking a band that passes (spec §14).

- [x] Acquire `data/raw/mcpm/trace.bin` + `export_metadata.txt` and the fork's packed VAC catalog
      per `data/raw/mcpm/README.md` (both gitignored; announce the sizes to the user first).
- [x] The dev-only packed loader ingests the fork's VAC catalog (324,901 points) and runs with the
      parameters transcribed from `export_metadata.txt`.
- [x] A 712×1200×728 run completes on the maintainer machine and exports. If it does not fit,
      record the largest resolution that does — spec §14 names this as the headline risk and Phase 1
      deliberately only demanded a 300-class grid.
- [x] `npm run mcpm-workbench:compare` against `data/raw/mcpm/trace.bin` reports TV distances and
      marginal deviations.
- [x] **Two independent workbench runs of the same configuration** establish the noise floor under
      racy deposits. Record both numbers — floor and workbench-vs-fork — in
      `tools/mcpm-workbench/README.md`, with the accepted band derived from the floor, not chosen.
- [x] Any statistic the workbench-vs-fork comparison misses by more than the noise floor is either
      explained in the README or logged as an open item in `docs/BACKLOG.md` before Phase 4 starts.
- [x] Commit: `docs(mcpm-workbench): record the measured validation bands`.

---

# Phase 4 — quirk strip and energy smoke

### T24: quirk strip sweep

**Files (modify):** `src/services/gpu/shaders/mcpm/constants.wesl` and whichever kernels lose a
flag. **Depends on:** T23. **Parallel with:** T25.

**Contract (spec §13 Phase 4):** flip each quirk override off **individually** and re-run the
comparator. A flag whose removal keeps the statistics inside the Phase 3 band is **deleted** —
default and all. A flag whose removal shifts them keeps its default, with the measured delta
recorded beside it in a comment (this is exactly the kind of comment the budget exists for).

**Racy float deposits remain. They are not a quirk** — they are the Monte Carlo noise the method
runs on.

The plan accepts either outcome. Do not force the strip.

- [x] Invoke the `wesl-shaders` skill before touching any `.wesl`.
- [x] Sweep one flag at a time, comparator run per flag, results tabulated in the README.
- [x] Delete the clean flags; annotate the survivors with their deltas.
- [x] `npm run mcpm-workbench:probe` → exit 0.
- [x] Commit: `refactor(mcpm): strip the quirk flags the statistics do not need`.

---

### T25: energy smoke test in the probe

**Files (modify):** `tools/mcpm-workbench/probeGpuErrors.ts`. **Depends on:** T23.
**Parallel with:** T24.

**Contract (spec §12):** a probe step that runs N iterations on the tiny synthetic catalog from T12
and asserts `meanLogTraceAtPoints` lands in a band. Racy deposits make the result nondeterministic,
so it can **only ever be a band** — and the band comes from T23's measured floor, never from a
number invented here.

- [x] Add the step; run the probe several times to confirm the band holds across runs.
- [x] `npm run mcpm-workbench:probe` → exit 0, repeatedly.
- [x] Commit: `test(mcpm-workbench): energy smoke test in the GPU probe`.

---

# Track V — views (parallel, any time after T13)

Independent of the export and validation legs; they share only the grid buffers. V1, V2 and V3 are
mutually file-disjoint and may be reviewed in a pipeline.

### V1: agent splat view

**Files (create):** `src/services/gpu/shaders/mcpm/splatTransform.wesl`,
`src/services/gpu/shaders/mcpm/splatBlit.wesl`, `tools/mcpm-workbench/src/render/splatPass.ts`.
**Files (modify):** `tools/mcpm-workbench/src/render/RenderGraph.ts`, `src/state/slices/viewSlice.ts`,
`tools/mcpm-workbench/probeGpuErrors.ts`.

**Source:** `~/Development/vendor/cpp/polyphorm/shaders/cs_particles_transform.wgsl` and
`cs_particles_blit.wgsl`; diary at that repo's
`docs/superpowers/research/m3/wgsl-drafts/translation-notes.md` and `m3/render-path-design.md`.

**Contract (spec §7):** atomic `u32` accumulation buffer, row-major, **data points weighted 10000×,
agents 10×**, then a tonemapping blit. Watching the swarm is half the diagnostic value: a fit that
has collapsed or stalled shows there first.

- [x] Invoke the `wesl-shaders` skill; read both fork kernels and the m3 notes.
- [x] Port; register the pass; add the probe step.
- [x] Ask the user to look: the swarm is visible with data points clearly dominant.
- [x] Commit: `feat(mcpm): agent splat view`.

---

### V2: volumetric path tracer

**Files (create):** `src/services/gpu/shaders/mcpm/volpath.wesl`,
`src/services/gpu/shaders/mcpm/volpathBlit.wesl`, `tools/mcpm-workbench/src/render/volpathPass.ts`.
**Files (modify):** `tools/mcpm-workbench/src/render/RenderGraph.ts`, `src/state/slices/viewSlice.ts`,
`src/ui/ControlsPanel.tsx`, `tools/mcpm-workbench/probeGpuErrors.ts`.

**Source:** `~/Development/vendor/cpp/polyphorm/shaders/cs_volpath.wgsl` and
`cs_volpath_blit.wgsl`; the design write-up is that repo's
`docs/superpowers/research/m4/m4b-volume-pt-design.md`.

**Contract (spec §7):** delta (Woodcock) tracking, Henyey-Greenstein phase, Russian roulette,
`vec4<f32>` storage-buffer temporal accumulator. Parameters: sigma_t, albedo, sigma_e, anisotropy,
ambient trace, bounces, trace_max, exposure, compressive toggle. **Accumulation resets on any camera
or parameter change** — a stale accumulator is the classic failure here
(`project_renderer_frame_landmines`).

- [x] Invoke the `wesl-shaders` skill; read both fork kernels and the m4 design doc.
- [x] Port; register the pass; wire the nine parameters and the accumulation reset.
- [x] Add the probe step; `npm run mcpm-workbench:probe` → exit 0.
- [x] Ask the user to look: the image accumulates and resets correctly on camera and parameter moves.
- [x] Commit: `feat(mcpm): volumetric path tracer view`.

---

### V3: parameter save/load

**Files (create):** `tools/mcpm-workbench/src/state/exportParams.ts`,
`tools/mcpm-workbench/src/state/importParams.ts`,
`tests/tools/mcpm-workbench/state/importParams.test.ts`.
**Files (modify):** `tools/mcpm-workbench/src/ui/ControlsPanel.tsx`.

**Contract (spec §10):** a JSON download/upload of `McpmParams` + agent count + init mode + grid box.
The same object rides the export sidecar's `provenance.params`, so a screenshot's parameters are
always recoverable from its cube — **keep the two shapes identical**, don't let a second spelling of
the params object grow here.

**Test-first:**

- [x] `importParams round trips an exportParams payload` — every field, including the nested
      `GridBox`.
- [x] `importParams rejects a payload whose grid box has non-cubic voxels` — the invariant T7
      protects must survive a hand-edited JSON file, which is the whole point of allowing upload.
- [x] Implement; `npm test -- importParams` → GREEN.
- [x] Commit: `feat(mcpm-workbench): save and load parameter sets as JSON`.

---

## Definition of Done

**Deliverable inventory**

- [x] `npm run mcpm-workbench` (port 5500), `npm run mcpm-workbench:probe`,
      `npm run mcpm-workbench:compare` all exist and run.
- [x] Shader family `src/services/gpu/shaders/mcpm/`: `constants`, `io`, `grid`, `rng`, `propagate`,
      `decay`, `histogram`, `splatTransform`, `splatBlit`, `volpath`, `volpathBlit`, `vertex`,
      `fragment` — all `.wesl`, all linked by both the runtime and the tool `wesl.toml`, zero app
      consumers.
- [x] `tools/parsers/npyWriter.ts` exporting `writeNpy`.
- [x] `src/utils/volume/packLogTraceVoxels.ts` and `src/utils/math/f32ToF16Bits.ts` (moved from
      `tools/`), with every importer rewritten by `move-files`.
- [x] `initGpu(canvas, options?)` with `InitGpuOptions`; both existing call sites unedited.
- [x] `buildRhizomeVolume` accepts `<f2` `.npy`.
- [x] `tools/mcpm-workbench/README.md` records the measured noise floor, the accepted band, and the
      workbench-vs-fork numbers.
- [x] `docs/BACKLOG.md` gains the two items this PR deliberately deferred: the duplicate f16 decoder
      consolidation (spec §3 adjacent finding) and a `packLogTraceVoxels` test (it has none today,
      contrary to spec §12's aside).

**Named observable behaviours (manual smoke)**

- [x] Catalog load → HUD shows point count, NaN-fill count **and fraction**, resolved `GridElement`,
      summed byte budget.
- [x] Auto-fit box → manual override changes it → an over-budget configuration is refused **by name**,
      not by a crashed tab.
- [x] A running fit visibly sharpens into filaments; sense distance, turn angle, persistence and
      sharpness each move the image in the expected direction.
- [x] Pause, resume, reset, trace-only clear; agent count steps in 100k units.
- [x] Uniform-weight toggle changes the fit (if it does not, the fit is not using its weights).
- [x] View modes: trace raymarch, agent splat (data points visibly dominant), path tracer
      (accumulates, resets on camera/parameter change), preview export (matches the live raymarch in
      structure).
- [x] `.npy` + sidecar download → `buildRhizomeVolume` consumes it unmodified; the in-browser `.scfd`
      agrees with the importer's output within f16 rounding.
- [x] A saved parameter JSON reloads to a visually identical run.

**Deferral boundary — do not chase these in review**

- Bit-parity with the fork (unreachable: Dawn-native vs browser Tint, plus racy deposits).
- Racy non-atomic float deposits (kept forever, not a quirk).
- In-app MCPM layer, agent sort, center attraction, halocolor/velocity modes, named parameter
  regimes, slice-stack and overdensity/highlight views, `--shell` tiering of workbench exports.
- Any write to `public/data` or the manifest from the browser.
- Mobile, touch, non-Chromium support.
- Promoting `Slider`/`Toggle` to `src/components/common/`.
- Z-order or tiled grid indexing (spec §14: not pre-optimised; confined to `grid.wesl` if measured
  slow, and `npm run perf` does not cover this tool).
