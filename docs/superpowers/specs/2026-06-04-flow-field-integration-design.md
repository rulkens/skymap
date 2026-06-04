# Flow-field integration — design

**Status:** approved (brainstorm complete, awaiting plan)
**Date:** 2026-06-04
**Worktree/branch:** `worktree-integrate-flow-fields`

## Summary

Promote the standalone **cosmic-flow** dev tool (`tools/cosmic-flow/`, PR #247) — a
GPU compute-shader visualization of CF4++ peculiar velocities — into a first-class
layer of the main skymap renderer, overlaying the real galaxy field. Both flow modes
(advect, streamline) ship behind a toggle; the layer is default-off and opt-in.

This is the engine's **first compute pass**. Everything else maps onto existing
conventions: the scalar-volume renderer is the structural template, the per-type
data stores are the state template, and the WESL/explicit-BGL/additive-emissive
patterns are already house style.

## Goals

- Flow renders **in the same world frame** as the galaxies and the CF-4 density
  volume — they overlay by construction.
- Flow is a **peer layer** (renderer + pre-pass compute + HDR pass), not a second
  engine paradigm bolted on.
- The ported code adopts the main renderer's conventions rather than importing
  cosmic-flow's spike-era shortcuts (notably the mutable-uniform seed race).
- Keep a thin isolated workbench for ongoing look/perf tuning and presentation,
  with **one** canonical implementation (no drift).

## Non-goals

- Porting cosmic-flow's `densityVolume` visualization — the main app already has a
  density volume layer (CF-4 / rhizome). The CF4++ δ channel is used for GPU
  seeding only, never rendered.
- Porting cosmic-flow's `structureCatalog` labels — the structure layer
  (cluster/supercluster/group) already labels Virgo/Shapley/etc.
- Making flow interactive (no picking).
- Tiered flow data — the velocity cube is a single tier-agnostic file.

---

## Decisions (the resolved design tree)

### 1. Integration shape — first-class engine layer

Flow is wired as a peer of points/volumes/filaments. New `src/` pieces:

- `services/gpu/renderers/flowFieldRenderer.ts` — owns GPU resources: the velocity
  `texture_3d<rgba16float>`, the shared `part`/`trail`/`acc` storage buffers, the
  three compute pipelines (`seed`/`advect`/`streamline`), and the ribbon render
  pipeline. Reads the flow store each frame.
- `services/engine/frame/encodeFlowCompute.ts` — the per-frame compute dispatch,
  mirroring `encodeVolumes`. Runs inside the single frame command encoder, before
  the HDR passes.
- `services/engine/frame/passes/flowFieldPass.ts` — additive ribbon draw; inserted
  into `HDR_PASSES` among the structure layers (after `filamentsPass`).
- `services/engine/data/createFlowFieldStore.ts` + `@types/engine/data/FlowFieldStore.d.ts`.
- `EngineFlowFieldsHandle` (`@types/engine/handles/...`) — thin setters into the
  store + `requestRender()`.

Rejected: embedding cosmic-flow's `Visualization` Strategy/registry + its own store
as a sub-engine (Approach B) — imports a second architecture that wouldn't compose
with render-on-demand / GPU timing / debug toggles. Rejected: precomputed
streamline geometry with no compute (Approach C) — can't do advect.

### 2. Modes & defaults

- Both **advect** (drifting particle ribbons) and **streamline** (static integrated
  curves with a travelling pulse) ship behind a mode switch.
- **Default mode: advect** (the iconic, unambiguous-motion "hero" look).
- **Layer default-off** — first load shows the normal galaxy field; flow is opt-in.
- Modes are mutually exclusive.

### 3. Buffers — one shared set, reseed on switch

Because the modes never render simultaneously, advect and streamline **share one**
`part`/`trail`/`acc` buffer set; switching modes triggers a reseed and swaps the
compute entry point. Capacity is **40k particles** (also the default count). The
trail buffer dominates:

| Buffer | Size @ 40k | Note |
|---|---|---|
| `part` (pos+age) | 40k × 16 B = 0.64 MB | |
| `trail` | 40k × 32 × 16 B = 20.5 MB | TRAIL=32 ring points |
| `acc` | 40k × 4 B = 0.16 MB | advect carried-distance |
| **total (shared)** | **≈ 21.3 MB** | vs cosmic-flow's 106 MB (two sets) |

`MAX_PARTICLES` (= buffer capacity = slider ceiling) is a single tunable constant;
lowering it to halve memory needs no architectural change.

### 4. Data substrate & world placement

- One self-contained **128³ RGBA16F** cube: `R=vx, G=vy, B=vz, A=δ` (overdensity),
  `≈16 MB`, tier-agnostic `public/data/flowfield.bin` + JSON sidecar
  (both gitignored, like other `public/data/*` artefacts).
- δ drives **density-weighted GPU seeding only**; it is never rendered.
- **Placement reuses the scalar-volume frame machinery**: the cube carries
  `origin` / `extent` (1000 Mpc/h box) / `frameKind` metadata matching `cf4-density`,
  and `flowFieldRenderer` builds its model matrix with `buildCubeModelMatrix` and
  feeds `model`/`invModel` into the compute + render shaders. Result: flow registers
  with the galaxies **and** the existing CF-4 density volume by construction (they
  are the same reconstruction family — the δ array is the same `d_mean_CF4pp` the
  CF-4 density volume already uses).
- **Work item, not just verification:** cosmic-flow's extractor *deliberately*
  ignored frame alignment ("we label the three array axes z,y,x arbitrarily"). The
  new extractor must emit the **true SG axis order** + correct `origin`/`extent`/`frameKind`.

The flow shaders are adapted away from cosmic-flow's baked `[-1,1]` centred cube to
consume `model`/`invModel` (consistent with `scalarVolumeRenderer`).

### 5. Compute & the seed race — delete the mutable flag

cosmic-flow's seed race comes from carrying a **one-shot signal in a mutable shared
uniform** (`compPrm.seedFlag`), which forces an isolated submit. We remove the root
cause instead of scheduling around it:

- A dedicated **`seed` compute entry point** sits beside `advect`/`streamline`, all
  three sharing **one explicit compute bind-group layout** (never `layout:'auto'`).
- "Reseed vs steady frame" is expressed as **which passes get encoded**, not as a
  value written into a shared uniform. The only per-frame `writeBuffer` is the
  params block, read uniformly by whichever passes run.
- Therefore the reseed **rides the normal frame encoder** — `encodeFlowCompute`
  emits seed-(then-)integrate into the per-frame encoder; WebGPU inserts the
  storage-buffer barrier between compute passes. **No out-of-band submit**; the
  engine's one-encoder-per-frame invariant is untouched.
- `flowFieldRenderer.maybeReseed()` records "encode the seed pass this frame" on
  enable / mode-switch / count-change; it is a no-op on steady frames.

This aligns flow with the render-only renderers, which already obey "select the
pipeline / bake per-instance data — never mutate a shared uniform mid-frame"
(`pointRenderer`'s per-vertex source code; the per-vertex selection attribute).
Flow is the engine's first compute renderer and **sets the precedent** for the
compute variant; no cross-renderer abstraction is extracted now (YAGNI — the second
compute renderer is the moment to consolidate a helper).

### 6. Compositing

- Ribbons use **additive blend** (`one,one,add`), **no depth test/write** — the HDR
  pass has no depth attachment (all layers are emissive). Order in `HDR_PASSES` is
  therefore cosmetic; flow sits among the structure layers. No occlusion against
  galaxies.
- The **global** `exposure` / `toneMapCurve` tonemap the shared HDR target for the
  whole scene. Flow's private tonemap and its `exposure`/`contrast` knobs are
  **cut** (a second tonemap would double-correct).
- The user-facing **intensity** slider is a pre-blend brightness multiplier in the
  ribbon fragment shader.
- Flow is **non-interactive**: no pick-texture write, no `selectionEncoding` source
  code.

### 7. Render-on-demand

Flow-enabled ⇒ continuous render until toggled off. One term is added to the
`runFrame` reschedule predicate: `flow.enabled && flowFieldRenderer.isAnimating()`.
Both modes animate (advect drifts; streamline's pulse advances). The continuous-GPU
cost is paid only when the user opts in; default-off keeps the cold-start experience
render-on-demand.

### 8. State — `createFlowFieldStore` (consistency with per-type stores)

Flow params live in a per-type store, mirroring `createFilamentStore` exactly
(frozen factory, getters + named mutation seams), assembled into `EngineData` by
`createEngineData`, **seeded at construction** (single fixed layer, but seeded for
demand-model symmetry with surveys/volumes).

- Store fields: `loaded`, `enabled`, `mode`, `intensity`, `count`, `trail`,
  `flowSpeed`, `densityBias`, `wander`.
- **Demand-driven loading:** `flowfield.bin` loads on the frame `enabled` first
  flips true (an asset slot, like surveys/volumes) — not at boot.
- `EngineFlowFieldsHandle` setters wrap store mutators + `requestRender()`.
- The renderer reads the store each frame; GPU **resources** stay on the renderer
  (stores hold status/settings only, never GPU objects).
- No separate `settings.flow` slice — for a single layer, "master enabled" and
  "layer enabled" are the same flag, owned by the store.

### 9. On-disk format — generalize `scalarFieldFormat` to N channels

Add a `channels` field to the scalar-field header; the loader derives the
`GPUTextureFormat` (`r16float` for `channels=1`, `rgba16float` for `channels=4`).
Existing single-channel fields become `channels=1`. One shared codec, one shared
frame header.

- This is a **format version bump**: old `.scfd` headers lack the field, so the
  loader's "regenerate the .bin" guard fires — re-emit `mcpm` + `cf4-density`
  alongside the new `flowfield`.

### 10. Build pipeline — new `tools/flow/`

Flow is its own visualization family (animated, time-based), so it gets its own
tools dir rather than living under `tools/volumes/`.

- `tools/flow/extractFlowField.py` — Python core (numpy), **frame-correct**
  extraction (rehomed + fixed from `tools/cosmic-flow/data/convertCf4ppVfield.py`).
- `tools/flow/buildFlowField.ts` — tsx wrapper (mirrors the `build-mcpm` pattern).
- npm script **`build-flow-field`**.
- Raw npz registered in `rawDataRegistry` as `cf4.vfield-npz →
  data/raw/cf4/CF4pp_mean_std_grids.npz` (`source: 'gitignored'`, upstream URL).
  It is the **same** upstream ensemble the CF-4 density pipeline already slices
  `d_mean_CF4pp.npy` from — one file, two consumers — so it lives in `data/raw/cf4/`
  (not a parallel `cf4pp/` dir) and its provenance is a "Velocity field" section
  appended to the existing `data/raw/cf4/README.md`, preserving single source of
  truth. *(Refined during execution 2026-06-04; the original draft assumed a
  separate `cf4pp/` artifact.)*
- Output `public/data/flowfield.bin` (+ sidecar) added to the `tools/deploy/syncR2.ts`
  `ALLOW` filter (tier-agnostic, like `2mrs.bin`/`filaments.bin`).

### 11. UI

- **SettingsPanel** (user-facing): a Flow row — enable toggle, mode switch,
  intensity slider.
- **DebugPanel** (dev tuning): a new subsection — count, trail, flowSpeed,
  densityBias, wander sliders.
- **Labels:** none added; flow converges toward the existing structure labels.

### 12. Tool fate — rewire to `tools/flow-workbench/`

cosmic-flow is rewired into a thin **`tools/flow-workbench/`** kept for tuning and
presentation:

- **Deleted** (the duplication): `visualizations/flowField/` (class + shaders +
  constants), `visualizations/densityVolume/`, the `Visualization`/registry
  interface, `data/convertCf4ppVfield.py`.
- **Kept, rewired:** the Vite app (port 5300), the HDR render graph (`blit.wesl`
  tonemap), orbit-camera wiring, the controls panel UI.
- **New adapter:** `createFlowHarness.ts` — mirrors *just the relevant slice* of
  `phases/initGpu` (device, camera-uniforms BGL, bare HDR target + tonemap, field
  load) and drives the **canonical** `src/` flow renderer + `encodeFlowCompute` +
  shaders. The harness *consumes* `src/`, so there is exactly one implementation.

Built as the **final** plan step, after the main-tool layer reaches parity. The dir
rename avoids confusion with the retired duplicate.

---

## Testing strategy

- **Constants parity:** `flowConstants.wesl` ↔ TS `constants.ts` (regex-read the
  `.wesl`, assert each value — the existing cosmic-flow pattern).
- **Format codec round-trip:** encode/decode the generalized scalar-field format for
  `channels=1` and `channels=4`; assert header + payload fidelity and the
  derived `GPUTextureFormat`.
- **Store unit tests:** `createFlowFieldStore` getters/mutators, seeded defaults
  (FilamentStore-style).
- **Extractor frame-correctness:** a known attractor (e.g. Virgo / Great Attractor)
  lands in the expected voxel after extraction (à la `auditCf4Anchors`).
- **Visual probe:** headless Playwright + WebGPU `page.screenshot()` (NOT canvas
  readback — the ANGLE-on-Mac quirk returns black) to confirm ribbons render and
  register against structure markers.

## Risks & watch-items

- **Frame alignment** is the highest-risk item — the extractor's axes were
  arbitrary; mis-mapping yields a visibly misregistered flow. Guard with the
  known-attractor voxel test and a visual overlay check against structure markers.
- **`invModel` ray/vector renormalization** — when `model` has scale, `invModel *`
  a unit world vector is not unit length; renormalize before using lengths as
  distances (a documented project hazard).
- **iOS WebGPU strictness** — the cube is a `texture_3d`, not a 1D LUT, so the
  `texture_1d` trap doesn't apply, but compile every new shader through
  `createShaderModuleWithDevLog`.
- **Memory** — 21.3 MB at 40k is modest, but flow stacks on top of `glade-large`
  (~130 MB); `MAX_PARTICLES` is the one knob to lower if iOS profiling demands it.
- **Format version bump** forces re-emit of `mcpm` + `cf4-density` and an R2 resync;
  call this out in the plan so a partial deploy doesn't ship mismatched `.scfd`.

## Phasing (for the plan)

Likely split into multiple plan files:

- **A — Format & build:** generalize `scalarFieldFormat` (channels); `tools/flow/`
  extractor + `buildFlowField.ts` + npm script + rawDataRegistry + README;
  `syncR2` ALLOW. Re-emit + verify the existing volumes under the new format.
- **B — Store, loader, demand:** `FlowFieldStore` + `createEngineData` wiring; the
  flow asset slot + demand-load on enable.
- **C — Renderer, compute, pass, shaders:** `flowFieldRenderer` (3 pipelines,
  explicit compute BGL, shared buffers); `encodeFlowCompute`; `flowFieldPass` in
  `HDR_PASSES`; the adapted `seed`/`advect`/`streamline`/ribbon WESL + constants
  parity test; render-on-demand predicate term.
- **D — Settings, handle, UI:** `EngineFlowFieldsHandle`; SettingsPanel Flow row;
  DebugPanel dev subsection.
- **E — Workbench:** rewire cosmic-flow → `tools/flow-workbench/` driving the
  canonical module; delete the duplicated `visualizations/` tree.
