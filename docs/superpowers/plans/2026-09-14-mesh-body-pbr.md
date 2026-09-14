# Mesh-body PBR — the feature

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

## Goal

The six mesh bodies (two Voyagers, four Mars rovers; the whale and the
petunias ride along) get real material inputs and real environment light:
baked normal / roughness / metallic atlases, Cook–Torrance GGX with a
metal/dielectric blend, the Sun as a sphere light of its true angular radius,
and image-based specular + diffuse from a **per-body reflection probe** captured
over a **once-baked solar-system sky**. Voyager's dish reads as metal, a rover's
panels as glass over cells, and the art-directed host-shine fill and the 0.08
ambient floor are deleted — the host planet is in the probe.

Runs after `2026-09-14-mesh-body-pbr-prep.md` (P2–P5) on the same branch; P1
(#697) is on `main`.

## Architecture

Data first, then the frame, then the material:

1. **Bake rows.** `BAKE_PASSES` grows `normal` / `roughness` / `metallic`
   rows; `flatten_materials` links all four; `buildMeshes` is unchanged and
   stops substituting for the four NASA models.
2. **BRDF LUT.** `tools/lut/buildEnvBrdfLut.ts` integrates the split-sum
   scale/bias table once and commits `public/lut/envBrdf.{bin,json}` (T2);
   `initGpu` loads it like the font atlases and hands it to
   `createMeshBodyRenderer`, which binds it in `@group(1)`.
3. **Capture rows.** `CUBEMAP_CAPTURES` becomes `sky` rows (`sgrAStar`,
   `solarSystem`) plus ONE `probe` row. The probe row has no render-target
   row: its faces are mip 0 of the **subject body's** own cube texture, minted
   in `setMesh` beside the material maps (`MeshResources.probe`). The scheduler
   picks at most one subject per frame — "one refresh in flight" is the row's
   shape, not a flag.
4. **Capture faces draw bodies.** A capture line may carry `bodyPasses`,
   expanded over the face context's host `body-m` row with a depth attachment
   the probe owns. Because the body renderers write one uniform buffer per body
   per draw (`docs/RENDERER.md` landmine #1), **every capture face is its own
   command buffer, submitted ahead of the frame's** — a body drawn for a face
   and for the view never shares a write. `finishCubemapCapture` runs the GGX
   prefilter after a probe's sixth face.
5. **Material.** `pbrDirectSphere` (sphere-light Sun), `envSplitSum` (LUT ×
   GGX-prefiltered probe; diffuse from the coarsest mip, T3), one shared
   `SUN_IRRADIANCE` (T4). Uniforms lose the host-shine fields and gain the Sun's
   angular radius.

## Tech Stack

TypeScript + raw WebGPU + WESL; Vitest; Blender 5.2 LTS (user's machine) for
the bake; `sharp`/`@gltf-transform` already in `tools/`. New committed asset:
`public/lut/envBrdf.{bin,json}` (64 KB). No new npm dependency.

## Spec

`docs/superpowers/specs/2026-09-12-mesh-body-pbr-design.md` — "Decisions
already ruled", "Ground preparation" (ideal shape, T1–T4, growth list,
adjacent findings). Where this plan departs from the spec's sketch it says so
inline under **Ruling**; the collected rulings are in
`.superpowers/pbr-plan-notes.md` (git-ignored) and this plan's "Rulings" section.

Pre-reading: `docs/RENDERER.md`, `docs/DATA.md`, `.claude/skills/wesl-shaders/SKILL.md`,
`.claude/skills/perf/SKILL.md`, `docs/superpowers/conventions/{comments,testing,simplicity,leanness,renderers}.md`,
the shipped P1 code (`src/data/rendering/cubemapCaptures.ts`,
`scheduleCubemapCaptures.ts`, `captureFaceAttachment.ts`, `cubemapFaceContext.ts`,
`executeFrame.ts`, `expandFrameOrder.ts`, `checkFrameOrder.ts`, `renderFrame.ts`).

## Global Constraints

- **Frame-file purity.** Every file in `src/services/engine/frame/` (incl.
  `timing/`, `passes/`) exports ONLY the symbol it is named for; helpers go to
  `src/utils/` or their own `frame/` file, constants to `src/data/`.
  `tests/services/engine/frame/frameFilePurity.test.ts`'s `ALLOWED` rows are
  exact and only go DOWN; a task that adds a stray has put it in the wrong file.
- **One symbol per file** in `src/utils/` and `src/@types/`; filename = symbol.
  `type` never `interface`. Deep relative imports, no barrels.
- **Renderer conventions** (`renderers.md`): factory + closure, named bag
  when a constructor arg is added (`createMeshBodyRenderer` converts in Task 4),
  `satisfies Renderer`, family folder, one `ContentPass` per renderer.
- **WESL:** single quotes in comments, imports at top one per line,
  `package::`; verify every new pipeline in the dev console via
  `createShaderModuleWithDevLog`. WGSL type errors do NOT fail `npm run build`.
- **TS↔WESL constants** are mirrored by hand and pinned in
  `tests/services/gpu/shaders/constants.parity.test.ts`.
- **Comment budget:** header ≤ 10 lines, comments ≤ half the code. Rationale
  that lives in the spec is linked, not restated.
- **File moves/renames** via `npm run move-files` (`--dry` first); symbol
  renames via `npm run refactor -- rename`. Spelled out where they occur.
- **USER-RUN steps** (Blender bake, visual gates, perf) stop the implementer;
  never fake an artefact or a measurement.
- **Each task ends green** (`npm test`, `npm run typecheck`, and `npm run
format:check` on touched files) and is one commit with the given message.

## Rulings (spec ambiguities resolved here)

- **One probe row, not one per body.** `CUBEMAP_CAPTURES.probe` is the
  single in-flight probe; its runtime names this frame's `subject`. Eight rows
  would need eight timing-slot sets and 48 view slots for a thing that never
  runs twice in a frame.
- **All six faces + prefilter in one frame,** per-face command buffers. No
  `facesDone` partial-sweep state; a probe is never sampled half-baked.
- **Probe roster = sky blit + the HOST's body-m row only** (planet, cloud and
  atmosphere shells, rings). Other bodies (moons, other meshes, the Sun) are
  not in a probe: a moon in a 128 px reflection is unobservable, the Sun stays
  analytic by ruling, and the subject must not draw into its own probe.
- **`solarSystem` sky bakes once per band entry** (`rebakeOnSettings: false`):
  a survey toggle re-baking six faces on every slider frame near Earth is a
  cost nobody can see in a rover panel.
- **Capture-only passes are legal.** `checkFrameOrder` accepts a pass drawn
  by no render line if a capture line rosters it (the sky blit).
- **`cubemapFaceContext`'s synthetic orbit distance = `nearMpc`**, not 1 Mpc:
  the body passes gate on `ctx.cam.distance < FOREGROUND_MAX_DISTANCE_MPC`. No
  lens roster pass reads `cam.distance`, so the lens is unaffected.
- **No `hostAngularRadius`, `probeMipCount`, `probeIntensity` uniforms.** The
  host is IN the probe; mip count is `textureNumLevels`; T4 puts probe and
  direct term in one unit so there is no intensity to tune. The struct shrinks
  to 144 bytes.
- **`bindProbe` / `setEnvBrdfLut` not built** — the probe is minted with the
  mesh, the LUT is a factory input (see the prep plan).
- **Perf poses for mesh bodies** are wall-clock/`?gpuTimings` probes at
  hand-flown poses with the sim clock paused; the harness's absolute poses
  cannot pin a body that moves with the clock.

## File Structure

### Created

```
public/lut/envBrdf.bin                              128×128 rg16float, committed
public/lut/envBrdf.json                             { width, height, format, samples }
tools/lut/envBrdfLut.ts                             pure split-sum integrator
tools/lut/buildEnvBrdfLut.ts                        CLI: writes the two files
src/services/gpu/resources/loadEnvBrdfLut.ts        fetch + upload at boot
src/@types/rendering/MeshProbe.d.ts
src/@types/rendering/SkyCapture.d.ts                (renamed from CubemapCapture.d.ts)
src/@types/rendering/ProbeCapture.d.ts
src/@types/rendering/SkyCaptureKey.d.ts
src/@types/rendering/ProbeCaptureKey.d.ts
src/@types/engine/state/SkyCaptureRuntime.d.ts      (renamed from CubemapCaptureRuntime.d.ts)
src/@types/engine/state/ProbeCaptureRuntime.d.ts
src/@types/engine/state/CubemapCaptureRuntimes.d.ts
src/@types/engine/frame/CaptureFace.d.ts            { ctx, bodySlabs }
src/@types/engine/frame/CaptureFaceInput.d.ts       { face, bodySlabs }
src/data/rendering/probeRefreshIntervalMs.ts
src/utils/gpu/captureRowAllocateWhen.ts
src/utils/math/angularRadiusRad.ts
src/services/gpu/lib/prefilterCubeGgx.ts
src/services/gpu/shaders/prefilterCube/prefilterCube.wesl
src/services/gpu/renderers/cubeFaceBlit/cubeFaceBlitRenderer.ts
src/services/gpu/shaders/cubeFaceBlit/cubeFaceBlit.wesl
src/services/engine/frame/passes/skyCubemapBlitPass.ts
src/services/engine/frame/scheduleProbeCapture.ts
src/services/engine/frame/scheduleSkyCaptures.ts
src/services/engine/frame/partitionCaptureSteps.ts
src/services/engine/frame/finishCubemapCapture.ts
```

### Modified

```
tools/meshes/prebake/meshPrebake.py                  three bake rows, emission swap, no constants
data/raw/meshes/{voyager,perseverance,curiosity,mer}/README.md
tools/utils/io/rawDataRegistry.ts                    "one albedo atlas" → four atlases
src/data/bodies/meshAssets.generated.ts             regenerated (substituted: [] ×4)
package.json                                         build-env-brdf-lut script
docs/DATA.md                                         public/lut beside public/fonts
src/@types/engine/handles/EngineGpuHandles.d.ts      envBrdfLut, cubeFaceBlitRenderer
src/@types/engine/handles/GpuHandleKey.d.ts          envBrdfLut excluded
src/services/engine/phases/initGpu.ts                loads the LUT
src/services/engine/gpuHandles/gpuHandleRegistry.ts  named bag; blit renderer row
src/services/gpu/renderers/bodies/meshBodyRenderer.ts
src/@types/rendering/MeshBodyRenderer.d.ts           probeOf
src/@types/rendering/MeshResources.d.ts              probe
src/services/gpu/shaders/bodies/meshBody/{io,fragment}.wesl
src/services/gpu/shaders/lib/pbr.wesl                pbrDirectSphere, envSplitSum
src/data/mesh/meshBodyUniformLayout.ts               44 → 36 floats
src/utils/gpu/packMeshBodyUniforms.ts
src/utils/scene/sunVisibleFraction.ts                uses angularRadiusRad
src/services/engine/frame/passes/meshBodiesPass.ts   sun angular radius; no host shine
src/@types/rendering/CubemapCapture.d.ts             becomes the sky|probe union
src/@types/rendering/CubemapCaptureKey.d.ts          SkyCaptureKey | ProbeCaptureKey
src/@types/engine/state/EngineState.d.ts             cubemapCaptures: CubemapCaptureRuntimes
src/@types/engine/frame/CaptureStepSpec.d.ts         captures[], bodyPasses
src/@types/engine/frame/CaptureFaceContexts.d.ts     value = CaptureFace
src/@types/engine/frame/ExecuteFrameArgs.d.ts        doc
src/data/rendering/cubemapCaptures.ts                solarSystem + probe rows
src/services/engine/presentation/scaleFadeBands.ts   solarSystemSky
src/services/gpu/renderTargets.ts                    solar-system-sky row
src/utils/gpu/createViewSlotUniformRing.ts           VIEW_SLOT_COUNT 7 → 19
src/services/engine/engine.ts                        seeds per kind
src/services/engine/frame/{cubemapFaceContext,scheduleCubemapCaptures,captureFaceAttachment,
  executeFrame,expandFrameOrder,checkFrameOrder,frameOrder,renderFrame}.ts
src/services/engine/frame/timing/{maxFrameInputs,passGroupTitles}.ts
src/services/engine/frame/passes/index.ts            skyCubemapBlitPass
docs/RENDERER.md                                     mesh-bodies paragraph
docs/backlog/2026-09-12-mesh-body-shadows.md         "host-shine … unshadowed" line
src/data/bodies/sceneMeshBodies.ts                   header says boundingRadiusM
src/data/bodies/rotationElements.ts                  prettier
tests/services/gpu/shaders/constants.parity.test.ts  SUN_IRRADIANCE comment
```

### Deleted

```
src/utils/scene/hostSkyFraction.ts + tests/utils/scene/hostSkyFraction.test.ts
```

---

## Task 1: Baselines (USER-RUN, no commit)

Everything later is judged against these; they cannot be reconstructed after
a feature commit lands.

- [ ] Dev server for THIS worktree; note its `Local:` port.
- [ ] `npm run perf -- --url http://localhost:<port> --scenario earth-surface --frames 30`
      and the same for `solar-system`; save both outputs under the scratchpad
      as `perf-before-*.txt`.
- [ ] Screenshots, sim clock PAUSED, saved beside them: (a) Voyager 1 framed
      on the bus + dish from ~10 m, Sun behind the camera's shoulder; (b)
      Curiosity, deck and mast from ~4 m, daytime; (c) Curiosity from the same
      pose at night (advance the clock ~12 h, pause); (d) the whale from ~30 m
      with Earth filling the background; (e) Earth from the `earth-surface`
      perf pose (ocean glint).
- [ ] `?gpuTimings`, strategy merged, clock paused: record the MERGED TOTAL at
      poses (a) and (b) — read it three times and keep the median.

---

## Task 2: Bake normal / roughness / metallic atlases (USER-RUN gate)

**Files:** `tools/meshes/prebake/meshPrebake.py`,
`data/raw/meshes/{voyager,perseverance,curiosity,mer}/README.md`,
`tools/utils/io/rawDataRegistry.ts` (`meshes.*` descriptions),
`src/data/bodies/meshAssets.generated.ts` (regenerated)

**Produces** (Python contract):

```python
BAKE_PASSES = [
    ("albedo",    dict(type="DIFFUSE", pass_filter={"COLOR"}), "sRGB",      None),
    ("normal",    dict(type="NORMAL", normal_space="TANGENT"), "Non-Color", None),
    ("roughness", dict(type="ROUGHNESS"),                      "Non-Color", None),
    ("metallic",  dict(type="EMIT"),                           "Non-Color", swap_metallic_to_emission),
]
# The fourth column is an optional (enter, exit) pair around the bake: Blender
# has no metallic bake, so the row routes every source material's Metallic
# input into Emission for the duration of its bake and restores it after.
def swap_metallic_to_emission(materials) -> restore_fn
```

`flatten_materials(obj, key, images)` links `albedo` → Base Color,
`roughness` → Roughness, `metallic` → Metallic (both Non-Color image nodes),
`normal` → a Normal Map node (tangent space) → Normal; the `Metallic 0` /
`Roughness 0.7` constants are DELETED with the rows that supersede them.

- [ ] Add the three rows and the swap. A Metallic input driven by a constant
      becomes an emission colour `(m, m, m)`; one driven by an image node is
      re-linked to Emission Color; emission strength 1.0; `use_pass_direct` /
      `use_pass_indirect` off is already the script's posture, so EMIT bakes the
      raw value. Data images are created with `is_data=True` and saved
      Non-Color — a data atlas saved through the sRGB view transform comes out
      gamma-bent, and the runtime decodes `_mr`/`_normal` linearly.
- [ ] Verify (log line) that the exported GLB carries `normalTexture` AND a
      combined `metallicRoughnessTexture`: Blender's glTF exporter packs
      image-driven Roughness (G) and Metallic (B) sockets into one texture.
      If a Blender version stops doing that, the fallback is to pack the two
      atlases into `<key>.prebaked.mr.png` in the script (numpy over
      `image.pixels`) and link it through a Separate Color node — say so in a
      comment only if that fallback is what ships.
- [ ] READMEs: replace "Having no normal or metallicRoughness map is expected …
      records `normalMapSubstituted: true`" with the four-atlas sentence and
      `substituted: []`. `rawDataRegistry.ts` `meshes.{voyager,perseverance,curiosity,mer}`
      descriptions: "one baked 2048² albedo atlas" → "four baked 2048² atlases
      (albedo, normal, roughness, metallic)".
- [ ] **USER-RUN:** `npm run prebake-mesh -- <key>` ×4 (sources linked as in
      prep Task 4), then `npm run build-meshes`. Expected stderr: no
      "substituting" warning for the four; the generated rows read
      `substituted: []`. Eyeball one `_mr.png`: the dish/foil parts of Voyager
      are bright in B (metallic), fabric/paint dark.
- [ ] `npm test -- meshes` green (the round-trip test pins the regenerated table).
- [ ] Commit: `feat(meshes): bake normal, roughness and metallic atlases for the NASA models`.
      Deployment of `public/data/meshes/*` to R2 is a post-merge step from
      `main` (`docs/DEPLOY.md`), as #693 did — note it in the PR body.

---

## Task 3: The environment-BRDF LUT tool and its committed asset

**Files:** `tools/lut/envBrdfLut.ts` (new), `tools/lut/buildEnvBrdfLut.ts`
(new), `public/lut/envBrdf.bin` + `envBrdf.json` (new, committed),
`package.json` (`"build-env-brdf-lut": "tsx tools/lut/buildEnvBrdfLut.ts"`),
`docs/DATA.md` (one clause), `tests/tools/lut/envBrdfLut.test.ts` (new)

**Produces:**

```ts
// tools/lut/envBrdfLut.ts — Karis 2013 split-sum second term.
// Texel (x, y): x → NoV in (0, 1] at texel centres, y → perceptual roughness
// in [0, 1]; value = (scale, bias) such that ∫ BRDF·cos ≈ F0·scale + bias.
// GGX importance sampling (Hammersley), Smith G with the IBL remap k = α/2.
export function envBrdfLut(size: number, sampleCount: number): Float32Array; // size*size*2

// tools/lut/buildEnvBrdfLut.ts — writes public/lut/envBrdf.bin (rg16float,
// row-major, y = 0 first, via src/utils/math/floatToF16) + envBrdf.json:
export type EnvBrdfLutMeta = {
  readonly width: number;
  readonly height: number;
  readonly format: 'rg16float';
  readonly samples: number;
};
```

- [ ] `tests/tools/lut/envBrdfLut.test.ts`:
  - `it('a mirror at normal incidence reflects everything: (NoV=1, roughness≈0) → scale≈1, bias≈0')`
    — read the texel at the top-right column of row 0; `scale` within 0.02 of 1,
    `bias` within 0.02 of 0 (hand-derived: F = F0 at VoH = 1, D·G/(4 NoV NoL)
    integrates to 1 over a Dirac lobe).
  - `it('never returns more energy than it receives: 0 ≤ scale + bias ≤ 1 at every texel')`.
- [ ] Implement; 128 × 128, 1024 samples (the tool runs once; seconds are
      fine). Write both files. Commit them: the font atlases are the precedent
      for a small deterministic build artefact in `public/`.
- [ ] `docs/DATA.md`: beside the sentence that says raw files and built
      artefacts are gitignored, name `public/fonts/` and `public/lut/` as the
      committed exceptions (font atlas, env-BRDF LUT), each with its `npm run`.
- [ ] Commit: `feat(lut): split-sum environment-BRDF LUT tool + committed 128² rg16float asset`.

---

## Task 4: Load the LUT at boot; `@group(1)` binds it

**Files:** `src/services/gpu/resources/loadEnvBrdfLut.ts` (new),
`src/@types/engine/handles/EngineGpuHandles.d.ts`,
`src/@types/engine/handles/GpuHandleKey.d.ts`,
`src/services/engine/phases/initGpu.ts`,
`src/services/engine/gpuHandles/gpuHandleRegistry.ts` (+ `GpuHandleConstructDeps`),
`src/services/gpu/renderers/bodies/meshBodyRenderer.ts`,
`src/services/gpu/shaders/bodies/meshBody/fragment.wesl`,
`tests/services/gpu/resources/loadEnvBrdfLut.test.ts` (new),
`tests/services/gpu/renderers/bodies/meshBodyRenderer.test.ts`

**Produces:**

```ts
// src/services/gpu/resources/loadEnvBrdfLut.ts — /lut/envBrdf.{json,bin} → texture
export function loadEnvBrdfLut(device: GPUDevice): Promise<GPUTexture>;

// EngineGpuHandles (excluded from GpuHandleKey, like fontAtlases)
envBrdfLut: GPUTexture | null;

// meshBodyRenderer — named bag (renderers.md: a new constructor arg converts)
export function createMeshBodyRenderer(init: {
  readonly device: GPUDevice;
  readonly targetFormat: GPUTextureFormat;
  readonly depthFormat: GPUTextureFormat;
  readonly reversedZ: boolean;
  readonly envBrdfLut: GPUTexture;
}): MeshBodyRenderer;
```

```wgsl
// meshBody/fragment.wesl — group 1 after this task
@group(1) @binding(0) var meshSampler: sampler;         // repeat, mip-linear (materials + probe)
@group(1) @binding(1) var envBrdfLut: texture_2d<f32>;
@group(1) @binding(2) var lutSampler: sampler;          // clamp-to-edge, linear, no mips
```

The LUT is read at `(NoV, roughness)`; clamp-to-edge is what keeps NoV → 0
from wrapping to the NoV = 1 column.

- [ ] `loadEnvBrdfLut.test.ts` (mocked `fetch` + mocked device):
      `it('sizes the texture from the json and uploads bytesPerRow = width × 4')`
      — a wrong `bytesPerRow` garbles the LUT silently.
- [ ] Implement the loader (`fetch('/lut/envBrdf.json')`, then the `.bin`;
      `createTexture({ format: meta.format, size: [w, h] })`,
      `queue.writeTexture` with `bytesPerRow: w * 4`). `initGpu` awaits it after
      `loadFontAtlases` and puts it on `state.gpu.envBrdfLut` and `handleDeps`.
- [ ] Renderer: named bag; `globalBindGroup` grows the LUT view + `lutSampler`.
      Fragment declares the two bindings (unused until Task 9 — an unused
      resource variable is legal WGSL). `meshBodyRenderer.test.ts`:
      `it('binds the LUT and its clamp sampler in the global group')`.
- [ ] `gpuHandleRegistry.ts` `meshBodyRenderer` row passes the bag with
      `deps.envBrdfLut`.
- [ ] `npm test -- meshBodyRenderer loadEnvBrdfLut` green; `npm run typecheck`.
- [ ] Commit: `feat(mesh-bodies): load the env-BRDF LUT at boot and bind it in the mesh renderer's global group`.

---

## Task 5: Capture rows by kind — the `solarSystem` sky row

**Files:** `src/@types/rendering/{SkyCapture,ProbeCapture,SkyCaptureKey,ProbeCaptureKey}.d.ts` (new),
`src/@types/rendering/{CubemapCapture,CubemapCaptureKey}.d.ts`,
`src/@types/engine/state/{SkyCaptureRuntime,ProbeCaptureRuntime,CubemapCaptureRuntimes}.d.ts`,
`src/@types/engine/state/EngineState.d.ts`, `src/@types/engine/frame/CaptureStepSpec.d.ts`,
`src/data/rendering/cubemapCaptures.ts`, `src/services/engine/presentation/scaleFadeBands.ts`,
`src/services/gpu/renderTargets.ts`, `src/utils/gpu/captureRowAllocateWhen.ts` (new),
`src/utils/gpu/createViewSlotUniformRing.ts`, `src/services/engine/engine.ts`,
`src/services/engine/frame/{cubemapFaceContext,scheduleCubemapCaptures,scheduleSkyCaptures,expandFrameOrder,checkFrameOrder,frameOrder}.ts`,
`src/services/engine/frame/timing/passGroupTitles.ts`,
`tests/data/rendering/cubemapCaptures.test.ts`,
`tests/services/engine/frame/{renderFrame.cubemapCaptures,cubemapFaceContext,expandFrameOrder,checkFrameOrder,frameFilePurity}.test.ts`,
every test fixture that spells `cubemapCaptures: { sgrAStar: … }`
(`renderFrame`, `renderFrame.timing`, `renderTargets`, `tests/visual/renderFrameSplitBaseline`)

**Produces:**

```ts
// src/@types/rendering/SkyCaptureKey.d.ts
export type SkyCaptureKey = 'sgrAStar' | 'solarSystem';
// src/@types/rendering/ProbeCaptureKey.d.ts
export type ProbeCaptureKey = 'probe';
// src/@types/rendering/CubemapCaptureKey.d.ts
export type CubemapCaptureKey = SkyCaptureKey | ProbeCaptureKey;

// src/@types/rendering/SkyCapture.d.ts — the P1 row shape + kind + one policy bit
export type SkyCapture = {
  readonly kind: 'sky';
  readonly target: string;
  readonly anchor: BodyRegion;
  readonly band: FadeBand;
  readonly nearMpc: number;
  readonly viewSlotBase: number;
  /** false ⇒ one bake per band entry (settings writes are ignored once baked). */
  readonly rebakeOnSettings: boolean;
};
// src/@types/rendering/ProbeCapture.d.ts — no target: faces are the subject's own cube
export type ProbeCapture = {
  readonly kind: 'probe';
  readonly faceSizePx: number;
  readonly nearMpc: number;
  readonly viewSlotBase: number;
};
// src/@types/rendering/CubemapCapture.d.ts
export type CubemapCapture = SkyCapture | ProbeCapture;

// src/data/rendering/cubemapCaptures.ts
export const SKY_CAPTURE_KEYS: readonly SkyCaptureKey[];
export const CUBEMAP_CAPTURES: Readonly<
  Record<SkyCaptureKey, SkyCapture> & Record<ProbeCaptureKey, ProbeCapture>
>;
// rows: sgrAStar (as today, rebakeOnSettings: true, viewSlotBase 1),
//       solarSystem { target: 'solar-system-sky', anchor: regionById('solar-system'),
//                     band: SCALE_FADE_BANDS.solarSystemSky, nearMpc: 0.1 au (as the lens),
//                     viewSlotBase: 7, rebakeOnSettings: false },
//       probe { faceSizePx: 128, nearMpc: 1 * SCALE_UNITS.M_TO_MPC, viewSlotBase: 13 }

// src/@types/engine/state/SkyCaptureRuntime.d.ts — the P1 runtime, renamed
// src/@types/engine/state/ProbeCaptureRuntime.d.ts
export type ProbeCaptureRuntime = {
  /** The body whose probe this frame's faces write; null when idle. */
  subject: string | null;
  /** Per body, `ctx.nowMs` of its last completed refresh. */
  refreshedAtMs: Map<string, number>;
};
// src/@types/engine/state/CubemapCaptureRuntimes.d.ts
export type CubemapCaptureRuntimes = Readonly<
  Record<SkyCaptureKey, SkyCaptureRuntime> & Record<ProbeCaptureKey, ProbeCaptureRuntime>
>;

// scaleFadeBands — keyed on CAMERA distance from the Sun; wide enough for a
// Voyager for two centuries (170 au + 3.6 au/yr)
solarSystemSky: { fullAt: 500 * AU_TO_MPC, goneAt: 1000 * AU_TO_MPC },

// src/utils/gpu/captureRowAllocateWhen.ts — the sky-cubemap row's allocateWhen, twice
export function captureRowAllocateWhen(
  key: SkyCaptureKey, releaseMargin: number,
): (state: EngineState, isAllocated: boolean) => boolean;

// CaptureStepSpec — one line may name several rows sharing a roster
export type CaptureStepSpec = {
  readonly kind: 'capture';
  readonly captures: readonly CubemapCaptureKey[];
  readonly cosmoPasses: readonly string[];
  readonly near0Passes: readonly string[];
};

// src/services/engine/frame/scheduleSkyCaptures.ts — the P1 loop, over SKY_CAPTURE_KEYS
export function scheduleSkyCaptures(input: { state; ctx }): CaptureFaceContexts;
// scheduleCubemapCaptures composes: sky now, probe from Task 8
```

- [ ] Renames first, tool-driven:
      `npm run move-files -- --dry src/@types/rendering/CubemapCapture.d.ts src/@types/rendering/SkyCapture.d.ts`
      then without `--dry`; `npm run refactor -- rename CubemapCapture SkyCapture`.
      Same for `src/@types/engine/state/CubemapCaptureRuntime.d.ts` →
      `SkyCaptureRuntime.d.ts` + `rename CubemapCaptureRuntime SkyCaptureRuntime`.
      Then re-create `CubemapCapture.d.ts` as the union.
- [ ] Add the keys, rows, runtime types, band, `solar-system-sky` render-target
      row: `fixedSizePx: { size: 256, layers: 6 }` and an `allocateWhen` of
      `captureRowAllocateWhen('solarSystem', 1.5)` (the `sky-cubemap` row uses the
      same helper with its existing margin constant). `VIEW_SLOT_COUNT` 7 → 19;
      its doc: slot 0 is the main view, the rest are claimed per
      `CUBEMAP_CAPTURES` row (the table's test pins the ranges).
- [ ] `engine.ts` seeds runtimes per row kind (`sky` → the P1 seed; `probe` →
      `{ subject: null, refreshedAtMs: new Map() }`), typed as
      `CubemapCaptureRuntimes`.
- [ ] `scheduleSkyCaptures.ts`: the P1 loop over `SKY_CAPTURE_KEYS`, with
      `const stale = runtime.bakedSettings === null || (row.rebakeOnSettings && runtime.bakedSettings !== state.settings)`
      replacing the settings-reference test. `scheduleCubemapCaptures.ts`
      becomes the composer (returns `scheduleSkyCaptures(...)` for now).
- [ ] `cubemapFaceContext`: `pose = { target: eye + forward * nearMpc, yaw: 0, pitch: 0, distance: nearMpc }`
      (ruling above); its docblock says why. Test:
      `it('places the synthetic orbit distance at the row's near plane, under the foreground gate')`
      — `ctx.cam.distance === nearMpc`.
- [ ] `CaptureStepSpec.captures`; `expandFrameOrder`'s capture arm and
      `checkFrameOrder`'s facts loop the array; `checkFrameOrder` reads a
      target only from `kind === 'sky'` rows. `frameOrder.ts`: the sky line
      becomes `captures: ['sgrAStar', 'solarSystem']` — one roster, two rows;
      its comment gains a sentence on the second row (the star field a probe
      is captured over; parallax across the solar system is sub-texel at 256²).
- [ ] `passGroupTitles`: `solarSystem·COSMO` / `solarSystem·NEAR0` → 'Sky capture'.
- [ ] Tests: `cubemapCaptures.test.ts` — the slot test is unchanged in
      meaning (every row, both kinds); the target test filters to `kind === 'sky'`
      and gains `it('sky rows sharing a FRAME_ORDER line bake the same roster')`
      is NOT needed (the line is one literal). `renderFrame.cubemapCaptures.test.ts`
      adds `it('a row with rebakeOnSettings false bakes on band entry and ignores a settings replacement until the band re-enters')`.
      `expandFrameOrder.test.ts`'s two capture tests drive `captures: [...]`;
      `checkFrameOrder.test.ts`'s capture fixture too. Introduce one fixture
      helper for the state's `cubemapCaptures` value (a `tests/…/fixtures/`
      file is fine outside `src/`), and point the five fixture sites at it.
- [ ] `frameFilePurity`: no new stray in `frame/`; `scheduleSkyCaptures` and
      `scheduleCubemapCaptures` each declare only themselves.
- [ ] `npm test` green; `npm run typecheck`.
- [ ] **USER-RUN check:** with `?gpuTimings`, the `solarSystem·COSMO/NEAR0·FACE[n]`
      rows fire once shortly after boot near Earth and never again while
      dragging a slider; the lens still bakes on band entry at Sgr A\*.
- [ ] Commit: `feat(captures): capture rows by kind; once-baked solar-system sky row`.

---

## Task 6: The body's own probe texture, and the GGX prefilter

**Files:** `src/@types/rendering/MeshProbe.d.ts` (new),
`src/@types/rendering/MeshResources.d.ts`, `src/@types/rendering/MeshBodyRenderer.d.ts`,
`src/services/gpu/renderers/bodies/meshBodyRenderer.ts`,
`src/services/gpu/shaders/bodies/meshBody/fragment.wesl`,
`src/services/gpu/lib/prefilterCubeGgx.ts` (new),
`src/services/gpu/shaders/prefilterCube/prefilterCube.wesl` (new),
`tests/services/gpu/lib/prefilterCubeGgx.test.ts` (new),
`tests/services/gpu/renderers/bodies/meshBodyRenderer.test.ts`

**Produces:**

```ts
// src/@types/rendering/MeshProbe.d.ts
export type MeshProbe = {
  /** rgba16float, 6 layers, full mip chain; mip 0 is captured, 1.. are GGX-prefiltered. */
  readonly cube: GPUTexture;
  /** depth32float, one layer, the capture's depth for the host body-m step. */
  readonly depth: GPUTexture;
  readonly mipLevelCount: number;
  readonly faceSizePx: number;
};
// MeshResources
probe: MeshProbe;
// MeshBodyRenderer
probeOf(id: string): MeshProbe | null;   // null ⇒ not resident

// src/services/gpu/lib/prefilterCubeGgx.ts — mips 1..N-1 of `cube` from mip 0,
// roughness(mip) = mip / (N - 1), Karis N=V=R, Hammersley GGX, PREFILTER_SAMPLES
// taps; one render pass per (mip, face) in ONE encoder, per-pass params via a
// dynamic-offset uniform buffer (256-B stride) — never one buffer rewritten per pass.
export function prefilterCubeGgx(device: GPUDevice, cube: GPUTexture): void;
```

```wgsl
// meshBody/fragment.wesl — group 0 grows the probe (unused until Task 9)
@group(0) @binding(5) var probeTexture: texture_cube<f32>;
```

The cube is created with `RENDER_ATTACHMENT | TEXTURE_BINDING` (faces are
colour attachments; the prefilter samples mip 0 through a cube view limited to
`mipLevelCount: 1` while writing a higher mip — disjoint subresources, legal).
`faceSizePx` comes from `CUBEMAP_CAPTURES.probe.faceSizePx`. `mipLevelCount` =
`mipLevelCount(faceSizePx, faceSizePx)` from `generateMipChain.ts`.

- [ ] `prefilterCubeGgx.test.ts` (mock device on `generateMipChain.test.ts`'s
      pattern, recording pass descriptors, bind groups and `writeBuffer`):
  - `it('opens one pass per (mip ≥ 1, face), rendering into that mip/layer while sampling a cube view pinned to mip 0')`.
  - `it('roughness climbs 0 → 1 across the mips, so the coarsest mip is the roughness-1 level the diffuse term reads')`
    — decode the per-pass uniform bytes at each 256-byte offset.
- [ ] Shader `prefilterCube.wesl`: fullscreen triangle (`lib/fullscreenTri`),
      uniforms `{ face: u32, roughness: f32, sampleCount: u32, _pad: u32 }`,
      direction from `(ndc, face)` by the `texture_cube` face convention
      (`CubeFace.d.ts` order; ±Y borrow world ±Z as `cubemapFaceContext`'s
      `FACE_UP` records), tangent frame around N=V=R, `D`-weighted sum with
      `NoL > 0` guard. Mip 0 is sampled with `textureSampleLevel(..., 0.0)`.
- [ ] Renderer: `setMesh` mints `probe` (cube + depth) and binds the cube's
      full-mip cube view at group-0 binding 5; `releaseResources` destroys
      both; `probeOf`. Test:
      `it('setMesh mints a 6-layer rgba16float probe cube with a full mip chain and a depth texture, both destroyed by clearMesh')`.
- [ ] `npm test -- prefilterCubeGgx meshBodyRenderer` green; `npm run typecheck`.
- [ ] Commit: `feat(mesh-bodies): per-body reflection-probe texture + GGX cube prefilter`.

---

## Task 7: Capture faces that draw a body row, each in its own command buffer

**Files:** `src/@types/engine/frame/{CaptureFace,CaptureFaceInput}.d.ts` (new),
`src/@types/engine/frame/{CaptureFaceContexts,CaptureStepSpec,ExecuteFrameArgs}.d.ts`,
`src/services/engine/frame/{expandFrameOrder,checkFrameOrder,captureFaceAttachment,executeFrame,renderFrame,scheduleSkyCaptures}.ts`,
`src/services/engine/frame/{partitionCaptureSteps,finishCubemapCapture}.ts` (new),
`src/services/engine/frame/timing/{maxFrameInputs,passGroupTitles}.ts`,
`tests/services/engine/frame/{expandFrameOrder,checkFrameOrder,executeFrame,renderFrame.cubemapCaptures,frameFilePurity}.test.ts`

**Produces:**

```ts
// CaptureFace — one scheduled face: its camera and the body rows it draws
export type CaptureFace = {
  readonly ctx: ReadyFrameContext;
  /** Body-m slab indices IN `ctx.slabs` to expand `bodyPasses` over; [] for a sky row. */
  readonly bodySlabs: readonly number[];
};
export type CaptureFaceContexts = ReadonlyMap<CubemapCaptureKey, ReadonlyMap<CubeFace, CaptureFace>>;

// CaptureFaceInput — what the expansion needs, camera-free (MAX_FRAME_INPUTS must build it)
export type CaptureFaceInput = { readonly face: CubeFace; readonly bodySlabs: readonly number[] };
// FrameInputs
readonly captureFaces: ReadonlyMap<CubemapCaptureKey, readonly CaptureFaceInput[]>;

// CaptureStepSpec
readonly bodyPasses: readonly string[];   // drawn per face per bodySlabs entry, depthLoad 'clear'

// captureFaceAttachment — per-kind table; the probe arm reads the row's subject
export function captureFaceAttachment(
  capture: CaptureFaceRef, ctx: ReadyFrameContext, state: EngineState,
): { readonly view: GPUTextureView; readonly clearValue: GPUColor; readonly depthView: GPUTextureView | null };

// partitionCaptureSteps — program order preserved within each group
export function partitionCaptureSteps(program: readonly FrameStep[]): {
  readonly faces: readonly { readonly key: CubemapCaptureKey; readonly face: CubeFace; readonly steps: readonly FrameStep[] }[];
  readonly frame: readonly FrameStep[];
};

// finishCubemapCapture — after a row's last face this frame; per-kind table
export function finishCubemapCapture(key: CubemapCaptureKey, state: EngineState): void;
// sky: nothing. probe: prefilterCubeGgx(device, probeOf(subject).cube).
```

Executor: a capture step whose `slab` is a body slab (`isBodySlabIndex`)
attaches `depthView` with the step's `depthLoad` (the expansion sets
`'clear'`, the painter-chain rule); its COSMO/NEAR0 steps attach none. The
ordinary arm resolves its depth VIEW up front too
(`specOf(target).depth ? depthViewOf(target) : null`), so `renderGroup` takes
`depth?: { view; loadOp }` and `depthAttachment(view, loadOp, reversedZ)` —
one shape for both arms. `executeFrame`'s `ALLOWED` row may only go down.

`renderFrame`: `partitionCaptureSteps(program)`; for each face group in order
— `createCommandEncoder`, `executeFrame` with that group, `submit` — then
`finishCubemapCapture` for each key that had faces, then the frame's own
encoder as today. `timingService.beginFrame()` stays first and
`endFrame(timingCtx, frameEncoder)` last: the query set is shared and
`endFrame` resolves the whole set, so face passes' timestamps land in the same
frame's readback. The docblock states the one reason for the split (landmine
#1: per-body uniform buffers).

- [ ] Types + `expandFrameOrder`: per face, the COSMO and NEAR0 steps as today,
      then one `{ slab, capture, depthLoad: 'clear', passes: resolve(spec.bodyPasses) }`
      per `bodySlabs` entry. `MAX_FRAME_INPUTS.captureFaces`: sky rows six faces
      with `bodySlabs: []`; the probe row six faces × every capacity body index
      (the same `k + 2` list `lensBodySlabs` uses). `passGroupTitles`:
      `probe·COSMO` and `probe·BODY[k]` (per capacity slot) → 'Probe capture'.
- [ ] `checkFrameOrder`: a pass named only on a capture line is legal — the
      "no line draws" throw fires only for a pass on NO line; the "listed on N
      lines" rule still counts render lines only; probe rows contribute no
      target id. Tests: delete `throws when a capture roster names a pass no render line draws`,
      add `it('accepts a pass that only a capture line rosters')` and
      `it('a probe row contributes no render-target id to the check')`.
- [ ] `captureFaceAttachment` per-kind table: sky → `layerViewOf(row.target, face)` + spec clear, `depthView: null`; probe →
      `probeOf(runtime.subject)` (throw if null: the scheduler picked a resident
      body this frame, so absence is a wiring bug), `cube.createView({ dimension: '2d', baseMipLevel: 0, mipLevelCount: 1, baseArrayLayer: face, arrayLayerCount: 1 })`,
      clear `{0,0,0,0}`, `depthView: depth.createView()`.
- [ ] `executeFrame` as described; `renderFrame` + the two new files.
      `scheduleSkyCaptures` returns `CaptureFace`s with `bodySlabs: []`.
      `ExecuteFrameArgs.captureContexts` doc: value is a `CaptureFace`.
- [ ] Tests (fixtures carry `{ ctx, bodySlabs }` now):
  - `expandFrameOrder`: `it('expands a face's body slabs into depth-clearing capture steps after its COSMO/NEAR0 pair')`;
    `it('a face with no body slabs expands to the COSMO/NEAR0 pair only')`.
  - `executeFrame`: `it('attaches the capture row's depth on a body-slab capture step and none on its COSMO step')`;
    the existing capture tests keep their names.
  - `renderFrame.cubemapCaptures`: `it('submits each scheduled face in its own command buffer, in program order, before the frame's')`
    — with two faces scheduled, `queue.submit` is called three times and the
    frame's `executeFrame` program contains no capture step;
    `it('runs finishCubemapCapture once per row that had faces this frame, after its faces')`
    (mock the module).
  - `frameFilePurity`: `partitionCaptureSteps`, `finishCubemapCapture` declare
    only themselves; `executeFrame`'s row unchanged or lower.
- [ ] `npm test` green; `npm run typecheck`.
- [ ] **USER-RUN check:** the Sgr A\* lens still bakes and renders (Task 5 of
      the P1 plan's smoke list, items 1–4) — the per-face submit must be
      invisible there.
- [ ] Commit: `feat(frame): capture faces may draw a body row and each submit their own command buffer`.

---

## Task 8: Schedule the probe; blit the sky under it; the FRAME_ORDER line

**Files:** `src/data/rendering/probeRefreshIntervalMs.ts` (new),
`src/services/engine/frame/scheduleProbeCapture.ts` (new),
`src/services/engine/frame/scheduleCubemapCaptures.ts`,
`src/services/gpu/renderers/cubeFaceBlit/cubeFaceBlitRenderer.ts` (new),
`src/services/gpu/shaders/cubeFaceBlit/cubeFaceBlit.wesl` (new),
`src/services/engine/frame/passes/skyCubemapBlitPass.ts` (new),
`src/services/engine/frame/passes/index.ts`, `src/services/engine/frame/frameOrder.ts`,
`src/@types/engine/handles/EngineGpuHandles.d.ts`, `src/services/engine/gpuHandles/gpuHandleRegistry.ts`,
`tests/services/engine/frame/scheduleProbeCapture.test.ts` (new),
`tests/services/gpu/renderers/cubeFaceBlit/cubeFaceBlitRenderer.test.ts` (new),
`tests/services/engine/frame/frameFilePurity.test.ts`

**Produces:**

```ts
// src/data/rendering/probeRefreshIntervalMs.ts
export const PROBE_REFRESH_INTERVAL_MS = 2000;

// scheduleProbeCapture — at most ONE subject per frame; single writer of the probe runtime
export function scheduleProbeCapture(input: {
  readonly state: EngineState;
  readonly ctx: ReadyFrameContext;
}): ReadonlyMap<CubeFace, CaptureFace> | null;
// candidates: sceneBodyPartition(state, ctx).meshes ∩ renderer.hasMesh; pick the
// oldest `refreshedAtMs` (never = −∞) whose age ≥ PROBE_REFRESH_INTERVAL_MS; faces
// via cubemapFaceContext at the body's positionMpc with the probe row's nearMpc /
// viewSlotBase / faceSizePx; bodySlabs = the host's body-m row in the FACE ctx
// (meshBodySlabHostId(body) !== body.id), else []. All six or nothing; on success
// runtime.subject = id and refreshedAtMs.set(id, ctx.nowMs); else subject = null.

// cubeFaceBlitRenderer — fullscreen triangle sampling a cube through a basis
export type CubeFaceBlitRenderer = Renderer & {
  /** `basis`: world-from-view columns (right, up, back) — the face ctx's `cam.poseBasis`. */
  draw(pass: GPURenderPassEncoder, basis: Readonly<Mat3>, cube: GPUTextureView): void;
};
export function createCubeFaceBlitRenderer(init: {
  device: GPUDevice;
  targetFormat: GPUTextureFormat;
}): CubeFaceBlitRenderer;

// skyCubemapBlitPass — name 'sky-cubemap-blit'; enabled iff the blit renderer exists
// and CUBEMAP_CAPTURES.solarSystem has baked (runtime.bakedSettings !== null);
// draw: renderer.draw(pass, ctx.cam.poseBasis, ctx.renderTargets.cubeViewOf(CUBEMAP_CAPTURES.solarSystem.target)).
// `poseBasis` is optional on OrbitCameraInit; a face ctx always carries the one
// cubemapFaceContext built it with (FACE_BASES: columns right, up, back) — absent ⇒ throw.
```

```ts
// frameOrder.ts — after the sky capture line
{
  kind: 'capture',
  captures: ['probe'],
  cosmoPasses: ['sky-cubemap-blit'],
  near0Passes: [],
  bodyPasses: ['earth', 'cloud-shell', 'planets', 'textured-bodies', 'rings', 'atmosphere-shell'],
},
```

The line's comment carries three exclusions with their reasons: `mesh-bodies`
(the subject would draw into its own probe), `star-spheres` / `field-star-sphere`
(the Sun stays analytic — spec ruling), `body-glints` / `orbit-trails` (not
environment). Roster passes read only `view`/`ctx`/`state`, as the sky line
already demands.

Blit direction: the face ctx's clip-Y is negated (`cubemapFaceContext`'s
`flipClipY`), so a fullscreen triangle that derives its own ray must mirror
the same axis — `viewDir = normalize(vec3(ndc.x, -ndc.y, -1.0))`, world =
`basis * viewDir` (90° symmetric frustum ⇒ tan = 1). The visual check for the
sign is Task 10's "Mars under the rover" item; get it wrong and the host lights
the DECK.

- [ ] `scheduleProbeCapture.test.ts` (`renderFrame.cubemapCaptures.test.ts`'s
      mocking style, `cubemapFaceContext` mocked):
  - `it('picks the drawn mesh body with the oldest refresh, one per frame')`;
  - `it('refreshes nothing while every candidate is inside PROBE_REFRESH_INTERVAL_MS')`;
  - `it('derives each face at the body's position with the probe row's near plane, slot base and face size, and resolves the host's body-m slab in the FACE context')`;
  - `it('a hostless body's faces carry no body slab')`;
  - `it('schedules nothing and records no refresh when a face context is null')`.
- [ ] Implement the scheduler; `scheduleCubemapCaptures` composes sky + probe
      into one map (`'probe'` entry only when non-null).
- [ ] Blit renderer + shader (`shaders/cubeFaceBlit/cubeFaceBlit.wesl`: `vs`
      via `lib/fullscreenTri`, `fs` samples `texture_cube` with
      `textureSampleLevel(..., 0.0)`; uniform = the 48-byte `mat3x3` basis;
      bind group rebuilt per draw around the given cube view — the lens
      renderer's reason). Pipeline: `targetFormat` (HDR), no blend, no depth.
      Test: `it('rebuilds its bind group per draw around the given cube view and writes the basis before the draw')`.
- [ ] Pass, registry row, `EngineGpuHandles.cubeFaceBlitRenderer`, the
      `FRAME_ORDER` line. `frameFilePurity`: `skyCubemapBlitPass` and
      `scheduleProbeCapture` declare only themselves.
- [ ] `npm test` green; `npm run typecheck`. `checkFrameOrder` passes at boot
      (the blit is capture-only; Task 7 made that legal).
- [ ] **USER-RUN check:** `?gpuTimings` at Curiosity: `probe·COSMO·FACE[0..5]`
      and `probe·BODY[k]·FACE[0..5]` rows appear once per
      `PROBE_REFRESH_INTERVAL_MS`, never on two consecutive frames; at Voyager
      only the `probe·COSMO` rows fire; away from every mesh body none fire.
- [ ] Commit: `feat(captures): per-body probe scheduling, sky blit, probe capture line`.

---

## Task 9: The material — sphere Sun, split-sum environment, no fills

**Files:** `src/services/gpu/shaders/lib/pbr.wesl`,
`src/services/gpu/shaders/bodies/meshBody/{io,fragment}.wesl`,
`src/data/mesh/meshBodyUniformLayout.ts`, `src/utils/gpu/packMeshBodyUniforms.ts`,
`src/utils/math/angularRadiusRad.ts` (new), `src/utils/scene/sunVisibleFraction.ts`,
`src/services/engine/frame/passes/meshBodiesPass.ts`,
`src/utils/scene/hostSkyFraction.ts` + `tests/utils/scene/hostSkyFraction.test.ts` (DELETE),
`tests/utils/gpu/packMeshBodyUniforms.test.ts`, `tests/utils/math/angularRadiusRad.test.ts` (new),
`tests/services/gpu/shaders/constants.parity.test.ts` (comment),
`src/@types/rendering/MeshBodyRenderer.d.ts`, `docs/RENDERER.md`,
`docs/backlog/2026-09-12-mesh-body-shadows.md`,
`src/data/bodies/sceneMeshBodies.ts` (header), `src/data/bodies/rotationElements.ts` (prettier)

**Produces:**

```wgsl
// lib/pbr.wesl — additions
// Sphere-light direct term (Karis 2013 "representative point"): the lobe is
// evaluated against the closest point on the Sun's disc to the reflection ray,
// and D is renormalised by (alpha / alpha')^2 with alpha' = saturate(alpha +
// 0.5 * sinAngularRadius). Diffuse uses the true 'l'. sinAngularRadius = sin of
// the Sun's angular radius from the surface (asin(R_sun / d)).
fn pbrDirectSphere(
  n: vec3<f32>, v: vec3<f32>, l: vec3<f32>,
  albedo: vec3<f32>, roughness: f32, f0: vec3<f32>, sinAngularRadius: f32,
) -> vec3<f32>;

// Split-sum image-based term. 'probe' holds GGX-prefiltered mips (roughness =
// mip / (levels - 1)); the LUT is (NoV, roughness) → (scale, bias).
//   R = reflect(-v, n); specular = probe(R, roughness * (levels - 1)) * (f0 * scale + bias)
//   diffuse = (1 - F_rough) * (1 - metallic) * albedo * probe(n, levels - 1)   // T3
fn envSplitSum(
  n: vec3<f32>, v: vec3<f32>, albedo: vec3<f32>, roughness: f32, metallic: f32, f0: vec3<f32>,
  probe: texture_cube<f32>, probeSampler: sampler, lut: texture_2d<f32>, lutSampler: sampler,
) -> vec3<f32>;
```

```wgsl
// meshBody/io.wesl — 144 bytes, 36 f32
//   offset   0..63:  mvp
//   offset  64..75:  sunDirLocal          offset 76..79: sunVisibleFraction
//   offset  80..127: model (mat3x3, 3 × 16)
//   offset 128..139: camPosLocal          offset 140..143: sinSunAngularRadius
struct MeshBodyUniforms {
  mvp: mat4x4<f32>,
  sunDirLocal: vec3<f32>,
  sunVisibleFraction: f32,
  model: mat3x3<f32>,
  camPosLocal: vec3<f32>,
  sinSunAngularRadius: f32,
};
```

```ts
// src/utils/math/angularRadiusRad.ts — asin(min(1, radius / distance)); the
// helper sunVisibleFraction keeps privately today, shared instead of duplicated
export function angularRadiusRad(radiusM: number, distanceM: number): number;

// packMeshBodyUniforms
export function packMeshBodyUniforms(args: {
  readonly mvp: Float32Array;
  readonly sunDirLocal: Readonly<Vec3>;
  readonly sunVisibleFraction: number;
  readonly model: Readonly<Mat3>;
  readonly camPosLocal: Readonly<Vec3>;
  readonly sinSunAngularRadius: number;
}): Float32Array;
```

Fragment after this task, in order: TBN as today; `albedo`; `mr = textureSample(metalRough).gb`
(roughness G, metallic B); `f0 = mix(vec3(DIELECTRIC_F0), albedo, metallic)`;
`diffuseAlbedo = albedo * (1 - metallic)`; `direct = pbrDirectSphere(n, v, u.sunDirLocal, diffuseAlbedo, roughness, f0, u.sinSunAngularRadius) * SUN_IRRADIANCE * u.sunVisibleFraction`;
`env = envSplitSum(n, v, albedo, roughness, metallic, f0, probeTexture, meshSampler, envBrdfLut, lutSampler)`;
`return vec4(direct + env, 1.0)`. **Deleted:** `hostShine`, the `AMBIENT`
import and the ambient line, `dirToHost`. `SUN_IRRADIANCE` stays a const
(T4): the probe captures the planets in `litShade` units, which the constant
already matches — that is the single-unit argument, and the reason
`constants.parity.test.ts`'s SUN_IRRADIANCE block keeps its test (update its
comment: not "the layout is full" but "one unit for probe and direct term").

- [ ] `angularRadiusRad.test.ts`: `it('the Sun from 1 au subtends 0.00465 rad')`
      (R = 696 340 km, d = 149 597 870.7 km — hand value 0.004655) and
      `it('clamps to π/2 inside the sphere')`. `sunVisibleFraction.ts`'s private
      helper calls it; its own tests are unchanged.
- [ ] `packMeshBodyUniforms.test.ts`: rewrite the index assertions for the
      36-float layout (`out.byteLength === 144`; `out[35]` = the sine at byte
      140; nothing past). `MESH_BODY_UNIFORM_FLOATS = 36`.
- [ ] `meshBodiesPass`: `sinSunAngularRadius: Math.sin(angularRadiusRad(SOLAR_RADIUS_KM * KM_TO_M, distanceMpc(bodyState.positionMpc, RENDER_ORIGIN_MPC) * MPC_TO_M))`;
      delete `hostSkyFraction`, `ATMOSPHERE_PARAMS`, `EARTH_SURFACE_PARAMS`
      imports, `hostShineColor`, `invDist`/`dirToHost`, and the fill comment;
      the `hosted` flag now gates only `sunVisibleFraction`. Header: the frame
      contract no longer names `dirToHost`. Delete `hostSkyFraction.ts` + its
      test (`grep -rn hostSkyFraction src tests` → nothing).
- [ ] Shaders as specified; `io.wesl`'s header table rewritten to the 144-byte
      layout; `fragment.wesl`'s header: no shadow term (landmine stays), the
      metal blend is built here, the probe is the ambient.
- [ ] `docs/RENDERER.md` "Mesh bodies" bullet: LUT in group 1, probe in the
      body's resources, no host-shine; `MeshBodyRenderer.d.ts` header likewise.
      `docs/backlog/2026-09-12-mesh-body-shadows.md`: "host-shine and the ambient
      floor stay unshadowed" → "the environment term stays unshadowed".
      `sceneMeshBodies.ts` header: `radiusM` → `boundingRadiusM`.
      `npx prettier --write src/data/bodies/rotationElements.ts`.
- [ ] `npm test` green; `npm run typecheck`; `npm run build`.
- [ ] **USER-RUN:** dev console clean for `meshBody.fragment`, `prefilterCube`,
      `cubeFaceBlit` (link errors show only here); a first look at Voyager and
      Curiosity — Task 10 is the real gate.
- [ ] Commit: `feat(mesh-bodies): GGX metal/dielectric material, sphere-light Sun, split-sum probe lighting; host-shine and ambient fills removed`.

---

## Task 10: Visual gate (USER-RUN)

Same poses as Task 1, sim clock paused, f.lux/Night Shift OFF. Compare
against the Task 1 screenshots; fix loops ride Task 9's files.

- [ ] **Voyager 1 (a):** the high-gain dish and the bus's foil read as metal —
      a soft, coloured (star-field-grey, faintly Sun-warm) sheen that moves as
      the camera orbits, plus ONE Sun highlight the size of the Sun's disc
      (~0.0003 rad at 170 au — a tight point, not a blown-out spike). Fabric /
      painted parts stay matte. No black metal (a black dish = probe unbound or
      LUT missing; a uniformly grey dish = prefilter wrote nothing).
- [ ] **Curiosity, day (b):** solar panels / RTG fins show a glossy, sky-tinted
      reflection; the undercarriage and wheel insides are tinted Mars-orange
      (host in the probe, BELOW the rover); the deck top is NOT orange-lit (a
      wrong blit sign puts Mars overhead). Painted white parts are matte white.
- [ ] **Curiosity, night (c):** no black hole in the star field — the
      night-side rover is a dim shape lit by the probe's Mars-glow (planets
      keep their 0.08 floor, so Mars in the probe is not black). Darker than
      before (the 0.08 mesh floor is gone) but readable.
- [ ] **Whale (d):** the Earth-facing flank carries blue-white earthshine
      that tracks the limb as the camera orbits; the sky-facing flank is
      star-dark. No banding across the flank (a 128 px probe's mip seams).
- [ ] **Earth (e):** the ocean glint is byte-for-byte the Task 1 screenshot's
      (only the mesh fragment changed material; `pbrDirect` is untouched
      since P3).
- [ ] Refresh cadence: orbit Curiosity slowly — the reflection updates
      stepwise every `PROBE_REFRESH_INTERVAL_MS`, without a visible pop (if the
      steps read as pops, halve the interval in `probeRefreshIntervalMs.ts`
      and re-measure in Task 11).
- [ ] `?gpuTimings`: probe rows as in Task 8's check; `solarSystem` rows only
      once after boot.

---

## Task 11: Perf gate and wrap (USER-RUN)

- [ ] `npm run perf -- --url http://localhost:<port> --scenario earth-surface --frames 30`
      and `solar-system`, same flags as Task 1; compare MERGED medians —
      expected neutral (no mesh body near; the sky row bakes once at boot,
      outside the measured window). A regression here means a probe or sky
      step fires without a subject.
- [ ] `?gpuTimings` MERGED TOTAL at poses (a) and (b), three reads, median vs
      Task 1. Expected: +0–0.3 ms on a non-refresh frame (the fragment's extra
      taps); a refresh frame shows the six face groups + prefilter once per
      interval. Report both numbers with the maintenance cost beside them in
      the PR body; a neutral-or-negative visual verdict HALTS the landing for
      the user's ruling.
- [ ] `/feature-done` on this plan and the prep plan; `deletion-audit` over
      the branch (host-shine remnants, the P1 `bindProbe`-shaped comments,
      any `probeIntensity` mention).

---

## Out of scope (deferred)

- **Self-shadowing / ground shadow** — `docs/backlog/2026-09-12-mesh-body-shadows.md`.
- **Nearby bodies and the Sun in the probe** (ruled out above); **aerial
  perspective on meshes** (froxel backlog); **probe resolution knob**.
- **`petuniasPrebake.py`** stays albedo-only; the whale keeps its Sketchfab maps.
- **Earth's own sphere-Sun / env term** — `pbrDirect` is unchanged for Earth.
- **R2 sync** of the re-baked `public/data/meshes/*` — post-merge, from `main`.

## Definition of Done

**Deliverable inventory**

- `BAKE_PASSES` has four rows; the four NASA rows of `MESH_ASSETS` read
  `substituted: []`; `_normal.png` / `_mr.png` under `public/data/meshes/` are
  2048² for those four.
- `public/lut/envBrdf.bin` (65 536 bytes) + `envBrdf.json` committed;
  `npm run build-env-brdf-lut` regenerates them byte-identically.
- `CUBEMAP_CAPTURES` has `sgrAStar`, `solarSystem` (sky) and `probe`;
  `EngineState.cubemapCaptures` is a `CubemapCaptureRuntimes`; `VIEW_SLOT_COUNT === 19`.
- `MeshResources.probe`, `MeshBodyRenderer.probeOf`, `prefilterCubeGgx`,
  `cubeFaceBlitRenderer`, `skyCubemapBlitPass`, `scheduleProbeCapture`,
  `scheduleSkyCaptures`, `partitionCaptureSteps`, `finishCubemapCapture`,
  `captureRowAllocateWhen`, `angularRadiusRad` each exist as one-symbol files.
- `FRAME_ORDER` has a sky capture line naming two rows and a probe capture
  line with `bodyPasses`; every capture face is its own command buffer.
- `MeshBodyUniforms` is 144 bytes with `sinSunAngularRadius`; no
  `hostShine*`, `dirToHost`, `hostSkyFraction`, `AMBIENT` in the mesh path.
- `pbr.wesl` exports `pbrDirectSphere` and `envSplitSum`.

**Named observable behaviours** — Task 10's seven items, attested by the user.

**Perf gate** — Task 11: `earth-surface` / `solar-system` neutral; the two
mesh poses within +0.3 ms on non-refresh frames, numbers in the PR body.

**Deferral boundary** — everything under "Out of scope"; no change to Earth,
planets, or the lens beyond the per-face command buffers (invisible).
