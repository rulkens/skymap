# Milky Way point-cloud renderer — design

**Status:** draft, awaiting user review.
**Depends on:** the GPU galaxy generation work (PR #403, branch `gpu-galaxy-generation`) — this
feature consumes its generation core verbatim. Implementation must start from a base that
contains that code.

## Goal

Replace the Milky Way impostor (a single billboard quad ray-marching an analytic spiral in
the fragment shader) with a real generated point cloud: the galaxy-renderer tool's GPU
compute generation (stars + dust) drawn in-world at the Milky Way's true position, scale,
and galactic orientation. Same wiring seams, dramatically better close-up fidelity, and the
first step toward procedural disks for other galaxies.

## Why now, and what stays out

- The GPU generation core just shipped in the tool (`tools/galaxy-renderer/`): stateless
  `pcg4d` hashing, two compute passes, carve-fn capacity authority, `GENERATION_UBO` offset
  authority, WESL↔TS parity test. It is self-contained and lifts cleanly.
- **Out of scope:** procedural disks for famous/catalog galaxies (this design keeps the draw
  interface galaxy-agnostic but wires exactly one instance), LOD tiers for many disks, any
  interaction with renderer unification (#385 folds this pass later like every other pass),
  changes to selection/pick, labels, focus framing, or the `settings.milkyWay` surface.

## Current state (what gets replaced, what stays)

| Piece                                                                                                                                                                       | Fate                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `src/services/gpu/renderers/milkyWayRenderer.ts` (322 ln, impostor pipeline)                                                                                                | **deleted** after the visual gate                       |
| `src/services/gpu/shaders/milkyWay/{fragment,vertex,io}.wesl` (809 ln)                                                                                                      | **deleted** after the visual gate                       |
| `src/services/engine/frame/passes/milkyWayPass.ts`                                                                                                                          | **modified** — renderer dep swaps, gate logic unchanged |
| `milkyWayPickRenderer.ts` + `milkyWayPick/*.wesl`                                                                                                                           | **untouched** (pick is a separate disk-shaped target)   |
| SOURCE_REGISTRY `MilkyWay` row, `settings.milkyWay.enabled`, fade key `'milkyWay'`, `milkyWayFadeAlpha` (10→50 Mpc smoothstep), `MILKY_WAY_CENTER_WORLD`, framing constants | **untouched**                                           |

## Architecture

### 1. Shared generation core moves to `src/`

The generation seam moves from `tools/galaxy-renderer/src/` to `src/services/gpu/galaxy/`
(TS) + `src/services/gpu/shaders/galaxyGen/` (WESL), and the tool re-points its imports at
`src/`. `services/gpu/` (not `services/engine/`) because the core is device-facing building
blocks — UBO layout, buffer sizing, compute pipelines — the same species as a renderer
factory; the engine side keeps only orchestration (the one-time generation call in
`initGpu`, the unchanged pass). The pure param math (`classifyHubbleType`,
`splitStarBudget`, `computeBarGeometry`) stays co-located: it exists solely to feed
carve/pack, and splitting a cohesive seam across directories buys nothing until a second
consumer appears. Tools depending on src is the correct direction (both tsconfigs already build under
`npm run typecheck`); duplicating the WESL is the one shape this design forbids — the parity
test exists to kill exactly that braid.

Moves (with their tests):

- `packGenerationUniforms` (+ `CATEGORY_CODE`), `generationUboLayout` (`GENERATION_UBO`),
  `carveStarLayout`, `carveDustLayout`, `populationIds`, `classifyHubbleType`,
  `splitStarBudget`, `computeBarGeometry`, `barLengthOf`, `outerRadiusOf`, `hiiPalette`,
  `grainScale`, `createGenerationPipelines`, `encodeGeneration` — the last two because the
  app's init step must dispatch generation and cannot import from `tools/`
- `GEN_RECORD_BYTES` (today a local const inside `createGalaxyEngine.ts`) extracted to its
  own one-symbol file in the core — the record-size authority both the tool's pipelines and
  the app's cloud renderer read their `arrayStride` from
- `generate.wesl` (both compute entry points and its lib)
- `generationShaderParity.test.ts` (path constants update)
- The `@types/model/` shapes they export (`GalaxyParams`, `StarBudget`, `GalaxyCategory`,
  `BarGeometry`, `HiiPalette`, `PopulationRange`, `GenerationLayout`, plus the engine-side
  `GenerationPipelines` and `ExtraGalaxySpec` that the moved pipeline/encoder code
  requires) — re-homed as a new
  `src/@types/galaxy/` subfolder, one type per file, converted from the tool's `.d.ts`
  style to plain `.ts` (main-app style). A dedicated subfolder because these form one
  procedural-galaxy domain that fits neither `data/` (parsed catalogs) nor `rendering/`
  (pipeline/framebuffer shapes); `@types/galaxy/` pairs with `services/gpu/galaxy/` the way
  the existing subfolders pair with their areas. The tool imports them deep-relative from
  `src/@types/galaxy/`, same direction as its code imports.

**Spike first:** a small early task verifies wesl-plugin resolves `package::` imports for
the moved WESL from both consumers (main app build + tool build; the wesl-plugin-reads-cwd
gotcha from the cosmic-flow sub-tool is the known hazard). If cross-root resolution fails,
the fallback is a vite alias in the tool's config — never a copy.

### 2. Single-source Milky Way preset

`src/data/milkyWay/milkyWayGalaxyParams.ts` — a committed `GalaxyParams` value (SBb/SBbc,
4 arms, bar, derived from the tool's "Milky Way (model)" reference entry) plus a fixed
`MILKY_WAY_GENERATION_SEED`. The tool's `referenceGalaxies.ts` imports this constant instead
of inlining its own copy: one home, the tool renders the identical galaxy the app ships.

### 3. Generate once at init

`initGpu` gains a generation step after device creation: carve layouts → create star/dust
vertex buffers (`capacity × GEN_RECORD_BYTES`, `VERTEX | STORAGE`, labeled
`galaxy:mwStarVB` / `galaxy:mwDustVB`) → write the packed UBO → encode both compute passes →
submit. Generation runs in the local galaxy frame with identity extra-lanes — world
placement is a draw-side concern (below), because the UBO's two-angle extra-rotation cannot
express the full equatorial→galactic rotation.

**Per-tier star budgets.** The star count scales with the user's tier (the root `tier`
slice that drives catalog bins; the engine-side hook is `makeRunTierTransition`):

| Tier   | Stars (planned) | Dust                              |
| ------ | --------------- | --------------------------------- |
| small  | 100k            | follows the carve's dust fraction |
| medium | 200k            | "                                 |
| large  | 400k            | "                                 |

A single `MILKY_WAY_STARS_PER_TIER` record in the calibration module holds these; the
preset's `starCount` is the medium value and the others derive by ×0.5 / ×2. Only
`starCount` varies per tier — morphology params are tier-invariant, so all tiers render the
same galaxy at different densities. Because tier changes at runtime, generation is not
strictly once: a tier switch re-runs carve → buffer recreate → dispatch (sub-millisecond,
same deterministic seed), driven by the existing tier-change path. Drawing a prefix of a
max-tier buffer is not an option — records are ordered by population, so a prefix would
drop whole populations rather than thin uniformly. No other regeneration path exists
(fixed preset, fixed seed).

### 4. `milkyWayCloudRenderer` — draw-side model transform

New `src/services/gpu/renderers/milkyWayCloudRenderer.ts` +
`src/services/gpu/shaders/milkyWayCloud/{stars,dust,io}.wesl`, adapted from the tool's draw
shaders but consuming the app's conventions:

- **Vertex input:** the generated record layout (`arrayStride: GEN_RECORD_BYTES`), same
  attributes as the tool. Dead records (size 0) collapse to zero-area quads, as in the tool.
- **Uniforms:** app `CameraUniforms` prefix + `model: mat4x4f` + `fadeAlpha: f32`, plus the
  two additions the adapted billboard shaders require: the camera's world-space right/up
  basis (the app's `CameraUniforms` carries no view matrix to derive it in-shader) and the
  calibration scalars (exposure, star px clamp, model scale). The tool's LOD/cull-bright
  knobs are dropped — the tool ships them defaulted off, so omitting them is
  behaviour-preserving. The model matrix is
  `translate(MILKY_WAY_CENTER_WORLD) × R_localToWorld × uniformScale(k)` where
  `R_localToWorld` is `worldToGalactic` transposed **composed with the tool's local-frame
  swizzle** (`galacticToShader`: local y = disk normal ↔ galactic Z/NGP) — the exact frame
  the impostor rendered in — and `k = MILKY_WAY_RADIUS_MPC / <preset disk radius in tool
units>`. `MILKY_WAY_RADIUS_MPC = 0.030` is minted in the calibration module (the impostor
  carried it only as a WESL const in the fragment shader this feature deletes). Built
  CPU-side once (wgpu-matrix), not per frame.
- **Star pipeline:** additive `one/one` — matches the HDR pass convention and the tool.
- **Dust pipeline:** multiplicative transmittance `color: { srcFactor: 'dst', dstFactor:
'zero' }` — the tool's exact blend. Drawn **after** the stars; the pass keeps its
  last-in-HDR slot, so dust correctly darkens both the MW's own stars and any background
  content behind it. No depth state (pass convention), no offscreen composite.
- **Fade:** stars multiply emission by `fadeAlpha`; dust outputs
  `mix(vec3(1.0), transmittance, fadeAlpha)` so a faded-out Milky Way stops darkening the
  scene. This is the one behavior with no tool precedent — the tool never fades.
- The renderer's draw interface takes `(buffers, model, fadeAlpha)` — galaxy-agnostic by
  shape so a future many-disks feature is a loop plus a rename, but nothing beyond the
  single MW instance is built.

`milkyWayPass.ts` swaps `deps.milkyWayRenderer` for the new renderer; its enable gate
(settings toggle × fade tail × distance fade) is unchanged.

### 5. Calibration module + visual gate

`src/services/gpu/galaxy/milkyWayCalibration.ts` holds the hand-tuned constants in one
place: model scale `k`, star size px clamp (min/max against the app's DPR + fov), and an
emission exposure factor mapping the tool's tuned brightness into the app's HDR → post
tonemap chain. The visual gate (manual, dev server) checks:

1. Close flythrough (≤ 0.15 Mpc): arms, bar, bulge, dust lanes read correctly; no
   popping against the near plane (0.01 Mpc).
2. Mid range (1–10 Mpc): the cloud reads as a coherent galaxy, no sparkle/aliasing storm.
3. Fade region (10–50 Mpc): smooth fade, dust darkening disappears with it.
4. iOS device check before any deletion — new WESL must pass WebKit's stricter Tint
   (invalid pipeline ⇒ silently dropped frames; see CLAUDE.md).

Only after the gate passes does the impostor teardown land (renderer + three shaders + its
uniform ABI; the original ShaderToy port record stays in the completed plan doc).

## Performance

- Generation: at init + on tier switch, two compute dispatches over 10⁵–4×10⁵ records —
  sub-millisecond GPU time, no per-frame cost.
- Per frame: two instanced draws over persistent buffers. No new render-wake sources (the
  MW is static; existing wake channels cover camera motion and fades; a tier-switch
  regeneration rides the wake the tier change already causes).
- Star budgets per tier: 100k / 200k / 400k planned (see §3); against the app's ~2.5M
  catalog points this is a small additive cost even at large. No LOD needed for a single
  galaxy.

## Testing

- `generationShaderParity.test.ts` moves with the core and keeps guarding the TS↔WGSL
  mirrors from `src/`.
- All existing carve/packer/budget tests move unchanged.
- New unit tests: model-matrix composition (translate×rotate×scale order, galactic frame
  matches `worldToGalactic` transpose), uniform packing for the cloud renderer, and blend
  states asserted on both pipelines (the dust multiply is load-bearing and silent if wrong).
- Visual verification is the manual gate above — not automated.

## Risks & fallbacks

- **Mid-range sparkle (1–10 Mpc):** subpixel additive points can alias. Mitigations in
  order: star px floor in calibration; brightness normalization by apparent density; if
  both fail, the documented fallback is a near/far crossfade to the (retained) impostor —
  which is the only condition under which the impostor survives.
- **wesl-plugin cross-root resolution:** spiked first; fallback is a tool-side vite alias.
- **Tonemap mismatch:** the tool tuned brightness against its own post chain; the app's
  differs. The exposure factor in the calibration module is the single knob; expect a
  tuning loop at the visual gate.
- **Sequencing:** this branch must contain the `gpu-galaxy-generation` code. Preferred:
  merge PR #403, branch from main. The stacked-branch alternative carries the known
  squash-sweep hazard and needs `--base` discipline.

## Definition of done

- Shared core lives in `src/`, tool imports it, zero duplicated WESL, parity test green
  from its new home.
- App draws the generated Milky Way at correct position/orientation/scale through the
  existing pass, fade, and settings seams; impostor deleted (or crossfade fallback
  consciously adopted and documented).
- Full suite + both typechecks green; visual gate signed off by the user, including iOS.
