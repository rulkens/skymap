# Progressive volume sampling (feature PR)

**Goal.** Ship [the spec](../specs/2026-11-25-progressive-volume-sampling-design.md) §3, §5 and §6
on the ground prep #1170 laid (squash `61e001926`). While a view stands still, the cosmic-web
density target averages jittered marches (weight `1/n`) up to a per-tier cap, then stops drawing.
Any change restarts the mean. The march jitter comes from a blue-noise mask, and the Trim slider
starts cutting.

**Base.** `main` at `61e001926`, branch `feat/volume-progressive-sampling`. The spec rides this PR
unchanged; it is already in `main`'s tree (it landed with #1170, byte-identical to the spike
worktree's copy).

**Pre-task answers (owner, ask fTey, 2026-11-25).** One PR at a time. The perf gate runs, as the
wall-clock bench of Task 10, not `npm run perf`.

**Backlog.** No `docs/BACKLOG.md` item matches this feature, so none is removed.

## Needs the owner's ruling

The plan as written grows **none** of the Layer contract, `ReconcileEffects` or `SagaContext`
beyond what #1170 landed. Three places where a literal reading of the spec would have grown one,
or where the plan picks a route the spec left open, are below for confirmation. The plan follows
the stated default unless the owner rules otherwise.

1. **Blue-noise mask delivery (spec §5: "loaded the same way and handed to the Layer").** Handing
   it to the Layer means a new member on `LayerCoreDeps`, which is Layer contract:
   ```ts
   // the route NOT taken
   readonly blueNoiseMask: GPUTexture; // loaded in initGpu beside envBrdfLut
   ```
   **Default:** the Layer starts the fetch itself in `create`, through a loader shaped like
   `loadEnvBrdfLut`, and each density slot's commit waits for it (Task 3). No contract grows, and
   no cube can draw before the mask is resident.
2. **Shots waiting for convergence (spec §3: "Shots and `settled()` wait for the cap").**
   `settled()` reads only the planners' `loading` vote, never `awake`
   (`sceneUnsettledReasons.ts:15`). A dedicated "converging" vote on `PlannerResult` would grow
   the planner contract. **Default:** the planner votes `loading` while below the cap **and only
   at rest** (`stillFrames > 0`), Task 5. The "at rest" part is needed because
   `tools/shot/README.md` promises auto-rotate never holds `settled()`, and a moving view restarts
   every frame, so it would never converge. One cost: `unsettled()` reports this as
   "layer streaming".
3. **Blue-noise source (spec §10, open).** NVIDIA's STBN masks are licensed under the "NVIDIA
   Source Code License" (non-commercial, research or evaluation only) or the "NVIDIA RTX SDKs
   LICENSE" (object code only, no open-source combination). Neither allows bundling them in
   skymap. **Default:** the spec's fallback, a `tools/lut/` builder that generates our own mask
   (Task 1).

## Decisions the plan makes (and the spike did otherwise)

- **No full-screen march.** The spike drew each field as a full-screen triangle so that every
  texel was written each frame. Its first history blend (`dst·(1−w) + src·w`, per field) needed
  that. With one decay draw per frame plus additive fields (spec §5), texels outside the cube's
  silhouette hold the restart clear (0) and decay to 0. So the shipped back-face cube draw stays:
  its ray is `worldPos − camPos`, with no unprojection. The spike's ray-direction landmine (an
  unprojected NEAR-plane point cancels in f32 on the forward-Z COSMO slab, 1.5–3.8 px jumps per
  zoom step) therefore never arises here. The spike used this same raster path as the reference
  its fixed full-screen form was diffed against (`fullscreen-vs-raster-d600.png`). Task 9 corrects
  `docs/RENDERER.md`'s unprojection advice for the next full-screen user, and Task 10 measures
  registration.
- **The decay draw is skipped at weight 1.** Weight 1 only ever happens on a restart frame, and
  on that frame the executor has just cleared the target, so `dst·0 = dst`. Skipping it keeps a
  moving frame's GPU work equal to today's.

## Tasks

| # | Task | Spec | Dispatch |
| --- | --- | --- | --- |
| 1 | Blue-noise mask builder and the committed mask | §5, §10 | D1 |
| 2 | The march jitters from the mask; the renderer takes a named bag | §3.1, §5 | D1 |
| 3 | The Layer loads the mask; a cube commits only once it is resident | §5 | D1 |
| 4 | The decay draw: one per frame, ahead of every field | §5 | D1 |
| 5 | Per-tier step and cap tables; the docs fact follows | §3.4, §3.7 | D2 |
| 6 | `planVolumeAccumulation` and `densityAccumulationKey`, pure and tested | §5 | D2 |
| 7 | The accumulation planner, wired: retained row, plan line, restart planner, cap gate | §3, §5 | D2 |
| 8 | Trim becomes a cut above the contrast deadband | §6 | D3 |
| 9 | `docs/RENDERER.md`: COSMO full-screen rays; progressive volume sampling | — | D3 |
| 10 | Controller: timing bench, image checks, owner checks | §8 | controller |

Dispatches (sdd-execution.md): **D1** Tasks 1–4, opus (shader, TS↔WGSL, GPU blend). **D2**
Tasks 5–7, opus (frame program, retained target landmine). **D3** Tasks 8–9, sonnet. Then
Task 10 runs inline, followed by one whole-branch review.

---

## Task 1: blue-noise mask builder and the committed mask

**Files:**
- `src/data/volume/blueNoiseMask.ts` (create)
- `tools/lut/blueNoiseMask.ts` (create)
- `tools/lut/buildBlueNoiseMask.ts` (create)
- `public/lut/blueNoise.bin` (create, committed: 65,536 B)
- `package.json` (modify: script `build-blue-noise-mask`)
- `tests/tools/lut/blueNoiseMask.test.ts` (create)

**Contract.**

```ts
// src/data/volume/blueNoiseMask.ts: read by the builder, the loader and nothing else (the shader
// reads the texture's own dimensions, so WGSL holds no copy).
export const BLUE_NOISE_MASK_SIZE = 64;
export const BLUE_NOISE_MASK_SLICES = 16;

// tools/lut/blueNoiseMask.ts: pure and deterministic for a seed.
/** Ranks of a void-and-cluster ordering over a size × size × slices torus, as r8 values:
 *  slice-major, then row-major, so slice s is rows s·size … s·size+size−1 of a size-wide image. */
export function blueNoiseMask(size: number, slices: number, seed: number): Uint8Array;
```

- **Energy.** Void-and-cluster (Ulichney 1993) with a separable energy:
  - a spatial Gaussian, `exp(−r²/(2·1.9²))` on the toroidal distance, between cells of one slice;
  - a temporal Gaussian, same σ in slices, between the slices of one pixel.

  Cells sharing neither the slice nor the pixel do not interact. Each slice is then spatially
  blue, and each pixel's sequence over time is spread out, which is what makes a short running
  mean converge.
- **Values.** For `N = size²·slices` cells, a cell of rank `r` gets `floor(r·256/N)`, so every
  byte value occurs `N/256` times.
- **Seed.** A seeded PRNG drives the initial random pattern, so a rebuild writes identical bytes.
  `Math.random` is banned.
- **Builder.** `buildBlueNoiseMask.ts` writes `public/lut/blueNoise.bin` at
  `BLUE_NOISE_MASK_SIZE` × `BLUE_NOISE_MASK_SLICES`, shaped like `buildEnvBrdfLut.ts`. Its header
  says the file is committed and rebuilt by hand, and why the NVIDIA masks are not used (licence,
  see "Needs the owner's ruling" 3). There is no JSON sidecar, because the dimensions are the
  constants above. A one-off build may take minutes. Truncating the spatial kernel at about 3σ
  is fine.

Steps:

- [x] Tests first, on a 16 × 16 × 4 grid (fast):
  - `every byte value occurs equally often`: each of the 256 values appears exactly 4 times.
  - `the same seed gives the same bytes`: this catches an unseeded build, which would produce a
    different committed file on each run.
  - `each slice is spatially blue`:
    - Measure the slice's DFT power over the frequencies with `0 < |k| ≤ 2`, with the mean removed.
    - Measure the same thing for a seeded random permutation of the same values: a white-noise
      control built in the test.
    - Summed over slices, the mask's power is ≤ 0.25 × the control's.
  - `each pixel's values integrate fast over time`: the mean over pixels of
    `|mean of the pixel's 4 values − 127.5|` is ≤ 0.5 × the same statistic for the control.
- [x] Implement, add the npm script, run it, and commit the 65,536 B `.bin`.
- [x] `npm run typecheck:fast`, `npm test -- blueNoiseMask`.

**Done when:** `public/lut/blueNoise.bin` exists, is rebuilt byte-identically by
`npm run build-blue-noise-mask`, and passes the four properties at test scale.

---

## Task 2: the march jitters from the mask; the renderer takes a named bag

**review: yes** (shader, TS↔WGSL binding contract)

**Files:**
- `src/@types/rendering/VolumeFieldRendererDeps.d.ts` (create)
- `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts` (modify)
- `src/services/gpu/shaders/scalarVolume/fragment.wesl` (modify)
- `src/services/engine/frame/passes/createScalarVolumePass.ts` (modify: header only, if its
  "jitter-dither spatial frequency" sentence no longer holds)
- `src/layers/cosmicWebDensity/create.ts` (modify: call site; Task 3 supplies the real mask)
- `tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts` (modify: call sites)
- `tests/services/gpu/renderers/volumeField/volumeUniformsLayout.parity.test.ts` (modify: call site)

**Contract.** This adds an argument to a positional factory, so the factory becomes a named bag
(simplicity.md, "Positional factory args" outlier).

```ts
// src/@types/rendering/VolumeFieldRendererDeps.d.ts
export type VolumeFieldRendererDeps = {
  readonly device: GPUDevice;
  /** The colour format the march writes into: the HDR offscreen, never the swap format. */
  readonly targetFormat: GPUTextureFormat;
  readonly fadeBgl: FadeUniformsBgl;
  /** r8unorm, BLUE_NOISE_MASK_SIZE wide, slices stacked vertically (Task 1's layout). Not owned:
   *  the caller destroys it. */
  readonly jitterMask: GPUTexture;
};

export function createVolumeFieldRenderer<Id extends string>(
  deps: VolumeFieldRendererDeps,
): VolumeFieldRenderer<Id>;
```

```wgsl
// fragment.wesl, group 0: one entry appended (bindings 0–4 unchanged)
@group(0) @binding(5) var jitterMask: texture_2d<f32>;
```

- **Jitter.** The `hash21Hq` seed (`fragment.wesl:218-229`) is replaced by:
  - `slice = jitterIndex % slices` and `cycle = jitterIndex / slices` (integer division);
  - `jitter = fract(mask[fragCoord % size, row slice·size + …] + f32(cycle) · 0.6180339887)`.
  - `size` and `slices` come from `textureDimensions(jitterMask)` (width, and height / width).
  - The read is **one** `textureLoad` per fragment, outside the step loop.
  - The golden-ratio shift per cycle keeps a pixel's sequence from repeating across the
    16-frame cycle (the spike's form).
- **`jitterIndex`.** It stays the engine frame index (prep §4.1). With a cap of 8 or 16, one
  accumulation run reads 8 or 16 consecutive slices, each at most once.
- **`JITTER_INDEX_WRAP`** stays, so the integer survives the f32 uniform. Its comment loses the
  "hash entropy thins past 1e5" clause, and so does the `jitterIndex` field doc
  (`fragment.wesl:92-96`). The 272 B uniform layout does not change.
- **Bind group layout.** `group0Bgl` gains binding 5, `{ sampleType: 'float', viewDimension:
  '2d' }`, fragment only. Each field's bind group in `upload` gets `jitterMask.createView()`,
  created once in the factory.
- The `hash21Hq` import leaves `fragment.wesl` if nothing else there uses it. The "Temporal seed"
  comment block is rewritten to cover the mask in its place (comment budget per comments.md).

Steps:

- [x] Type, factory signature, and every call site (both test files pass a stub texture).
- [x] Shader and bind group, as above.
- [x] No new test. A missing binding fails pipeline validation on the first draw, and the
      layout parity test is unchanged (no uniform moves).
- [x] `npm run typecheck:fast`, `npm test -- volumeField`.

**Done when:** the march reads its start offset from the mask once per fragment, and the
renderer holds no hash jitter.

---

## Task 3: the Layer loads the mask; a cube commits only once it is resident

**Files:**
- `src/@types/rendering/BlueNoiseMask.d.ts` (create)
- `src/services/gpu/resources/createBlueNoiseMask.ts` (create)
- `src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime.d.ts` (modify)
- `src/layers/cosmicWebDensity/create.ts` (modify)
- `src/layers/cosmicWebDensity/destroy.ts` (modify)
- `src/layers/cosmicWebDensity/densityCubes/load/createCosmicWebDensitySlot.ts` (modify)
- `tests/layers/cosmicWebDensity/densityCubes/load/createCosmicWebDensitySlot.test.ts` (modify)

**Contract.**

```ts
// src/@types/rendering/BlueNoiseMask.d.ts
export type BlueNoiseMask = {
  /** Exists from construction (bind groups may reference it); zero until `ready` resolves. */
  readonly texture: GPUTexture;
  /** Resolves once the bytes are written; rejects on a failed fetch. */
  readonly ready: Promise<void>;
};

// src/services/gpu/resources/createBlueNoiseMask.ts: fetches `/lut/blueNoise.bin` the way
// `loadEnvBrdfLut.ts` fetches its LUT (static shell, relative URL, no dataUrl).
export function createBlueNoiseMask(device: GPUDevice): BlueNoiseMask;

// CosmicWebDensityRuntime gains
readonly jitterMask: BlueNoiseMask;

// createCosmicWebDensitySlot gains a last parameter
createCosmicWebDensitySlot(entry, renderer, jitterMaskReady: Promise<void>)
// its commit: `await jitterMaskReady` before `renderer.upload(...)`.
```

- **Why commit waits.** No frame can then draw a cube with a zero mask (zero jitter: a visible
  step grid). No key bit is needed for "mask arrived". A failed mask fetch makes the commit throw,
  which the slot already turns into `gave-up`: the volume stays off and the rest of the app is
  untouched. That is milder than `envBrdfLut`, whose failure fails boot.
- **Texture.** `r8unorm`, `BLUE_NOISE_MASK_SIZE` × `BLUE_NOISE_MASK_SIZE·BLUE_NOISE_MASK_SLICES`,
  label `scalarVolume-jitter-mask`, `TEXTURE_BINDING | COPY_DST`. One `writeTexture` with
  `bytesPerRow: BLUE_NOISE_MASK_SIZE`.
- **Ownership.** `destroy.ts` destroys `runtime.jitterMask.texture` after the renderer.

Steps:

- [x] Test `a cube commits only after the jitter mask is written`:
  - Run a slot whose fetch resolves while `jitterMaskReady` is still pending.
  - `renderer.upload` has not been called, and the slot's state is `committing`.
  - After resolving the promise, `upload` is called once.
- [x] Implement as above. `create.ts` builds the mask first, then hands `jitterMask.texture` to
      the renderer bag (Task 2) and `jitterMask.ready` to each slot.
- [x] `npm run typecheck:fast`, `npm test -- createCosmicWebDensitySlot cosmicWebDensity`.

**Done when:** the Layer owns, fills and frees the mask, and no density cube reaches the renderer
before the mask does.

---

## Task 4: the decay draw, one per frame ahead of every field

**review: yes** (GPU blend state; the spike's two-field darkening bug)

**Files:**
- `src/services/gpu/shaders/scalarVolume/decay.wesl` (create)
- `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts` (modify)
- `src/services/gpu/lib/blendStates.ts` (modify: header list only)
- `tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts` (modify)

**Contract.**

```ts
// volumeFieldRenderer.ts, local (single site, blendStates.ts's rule)
const DECAY_COMPONENT: GPUBlendComponent = {
  srcFactor: 'zero', dstFactor: 'one-minus-constant', operation: 'add',
};
// decay pipeline: decay.wesl (vs via lib::fullscreenTri's fullscreenVertex, fs returns vec4(0)),
// empty pipeline layout, target blend { color: DECAY_COMPONENT, alpha: DECAY_COMPONENT },
// format = deps.targetFormat.
```

The order inside `draw(…, inputs)` (today `volumeFieldRenderer.ts:313-397`):

1. `setBlendConstant(w)` once, with `w = inputs.weight` (unchanged).
2. **New:** if `w < 1`, then `setPipeline(decayPipeline)` and `draw(3)`, which leaves
   `dst·(1−w)`.
3. `setPipeline(pipeline)`, the vertex and index buffers, and the field loop as today. Every field
   adds `w·field` through `WEIGHTED_ADDITIVE_BLEND`.

The result is `dst·(1−w) + w·Σ fields`. Every field is treated alike. On a restart (`w = 1`) the
target was just cleared by the executor, so the decay is skipped.

Steps:

- [x] Test `below weight 1, one decay draw precedes every field`:
  - Two active fields, weight 0.25.
  - The fake pass's call log is: `setBlendConstant` with 0.25, then `setPipeline` (the decay
    pipeline), then **exactly one** `draw(3)`, then two `drawIndexed`.
  - The decay pipeline is the `createRenderPipeline` descriptor whose target blend is
    `DECAY_COMPONENT` on colour and alpha. This regression test cites the spike bug in which every
    field decayed the fields before it (MCPM −65% with 2MRS on).
- [x] Test `at weight 1 no decay draw is issued`: `draw` is never called.
- [x] Implement. Update the module header (≤ 10 lines). In `blendStates.ts`'s "What deliberately
      does NOT fold in here", add the decay blend beside the weighted additive.
- [x] `npm run typecheck:fast`, `npm test -- volumeFieldRenderer`.

**Done when:** a `draw` at weight `w < 1` scales the target once and adds every field at `w`; at
weight 1 it issues exactly today's draws.

---

## Task 5: per-tier step and cap tables; the docs fact follows

**Files:**
- `src/layers/cosmicWebDensity/densityCubes/data/densityMarchSteps.ts` → renamed to
  `densityMarchStepsByTier.ts`:
  `npm run move-files -- src/layers/cosmicWebDensity/densityCubes/data/densityMarchSteps.ts src/layers/cosmicWebDensity/densityCubes/data/densityMarchStepsByTier.ts`
  (`--dry` first; never `git mv`)
- `src/layers/cosmicWebDensity/densityCubes/data/densitySampleCapByTier.ts` (create)
- `src/layers/cosmicWebDensity/densityCubes/passes/cosmicWebDensityPass.ts` (modify)
- `packages/website/src/data/docsRenderingFacts.ts` (modify: `render-density-march`; its
  `source` path string is not rewritten by move-files)
- `tests/packages/website/docsRenderingFacts.test.ts` (modify: `:99-102`)

**Contract.**

```ts
// densityMarchStepsByTier.ts (replaces DENSITY_MARCH_STEPS)
export const DENSITY_MARCH_STEPS_BY_TIER: Readonly<Record<Tier, number>> = {
  small: 64, medium: 128, large: 128,
};
// densitySampleCapByTier.ts: frames averaged after a stop; every one re-renders the whole scene.
export const DENSITY_SAMPLE_CAP_BY_TIER: Readonly<Record<Tier, number>> = {
  small: 8, medium: 16, large: 16,
};
```

Steps:

- [ ] Rename with move-files, then edit the file to the table above (one constant, its doc).
- [ ] `cosmicWebDensityPass`'s `inputs` reads `DENSITY_MARCH_STEPS_BY_TIER[state.tier]`, a
      stopgap until Task 7 takes `inputs` from the plan.
- [ ] Website fact `render-density-march`: "128 steps" becomes "up to 128 steps", and `source`
      points at the new file. No other copy changes.
- [ ] The docs test reads `Math.max(...sourceNumbers(<new file>, 'DENSITY_MARCH_STEPS_BY_TIER'))`
      and expects `up to ${max} steps`. `sourceNumbers` already parses an object literal's numbers.
- [ ] Grep for `densityMarchSteps` and `DENSITY_MARCH_STEPS\b`: nothing outside `completed/` plans.
- [ ] No new test: these are constants.
- [ ] `npm run typecheck:fast`, `npm test -- docsRenderingFacts cosmicWebDensity`.

**Done when:** the step count is per tier, the cap table exists, and the site's fact still matches
its constant.

---

## Task 6: `planVolumeAccumulation` and `densityAccumulationKey`, pure and tested

**Files:**
- `src/layers/cosmicWebDensity/@types/VolumeAccumulationPlan.d.ts` (create)
- `src/layers/cosmicWebDensity/densityCubes/utils/planVolumeAccumulation.ts` (create)
- `src/layers/cosmicWebDensity/densityCubes/utils/densityAccumulationKey.ts` (create)
- `tests/layers/cosmicWebDensity/densityCubes/utils/planVolumeAccumulation.test.ts` (create)
- `tests/layers/cosmicWebDensity/densityCubes/utils/densityAccumulationKey.test.ts` (create)

**Contract.**

```ts
// VolumeAccumulationPlan.d.ts (spec §5, verbatim fields)
export type VolumeAccumulationPlan = {
  /** Everything outside the view that invalidates the mean: settings, fades, tier, cube versions;
   *  `null` when no field is live. */
  inputsKey: string | null;
  /** 1-based sample number this frame; 1 means restart. */
  sample: number;
  /** Read by the executor's retained first touch (`restartRequested`). */
  restart: boolean;
  /** False once the cap is reached, and while nothing is live. */
  draw: boolean;
  /** `jitterIndex` = the frame index, `steps` = the tier's steps, `weight` = `1 / sample`. */
  inputs: VolumeFieldDrawInputs;
};

export function planVolumeAccumulation(
  prev: VolumeAccumulationPlan | undefined,
  view: Pick<FrameView, 'stillFrames'>,
  state: Pick<PassState, 'tier' | 'frameIndex'>,
  inputsKey: string | null,
): PlannerResult<VolumeAccumulationPlan>;

export function densityAccumulationKey<Id extends string>(
  ids: readonly Id[],
  settingsOf: (id: Id) => VolumeFieldSettings,
  opacityOf: (id: Id) => number,
  cubeStampOf: (id: Id) => number | null,
  tier: Tier,
): string;
```

`planVolumeAccumulation`, with `cap = DENSITY_SAMPLE_CAP_BY_TIER[tier]`:

| Case (first match wins) | sample | restart | draw | awake | loading |
| --- | --- | --- | --- | --- | --- |
| `inputsKey === null` (nothing live) | 1 | true | false | false | false |
| `stillFrames === 0`, or no `prev`, or `prev.inputsKey !== inputsKey` | 1 | true | true | `1 < cap` | `stillFrames > 0` |
| `prev.sample < cap` | `prev.sample + 1` | false | true | `sample < cap` | `sample < cap && stillFrames > 0` |
| otherwise (held at the cap) | `cap` | false | false | false | false |

- `inputs = { jitterIndex: state.frameIndex, steps: DENSITY_MARCH_STEPS_BY_TIER[tier], weight:
  1 / sample }` on every row. `settling` is always false: no capture draws the volume.
- `loading` holds only at rest so that continuous motion (auto-rotate) never holds `settled()`.
  See "Needs the owner's ruling" 2.
- The `null` row votes nothing. With the volume off, a stop must not re-render 16 frames.

`densityAccumulationKey` is exact: numbers via `String(n)`, never rounded, so a fade in flight
restarts every frame, as the spec requires. It is ordered by `ids`. It covers every member of
each field's `VolumeFieldSettings`, its opacity and its cube stamp, plus the tier.

Steps:

- [ ] `planVolumeAccumulation.test.ts`, hand values, `medium` (cap 16) unless named:
  - `a moving view restarts and does not vote loading`: `stillFrames` 0, prev sample 5 with the
    same key → sample 1, restart, draw, weight 1, awake, not loading.
  - `no previous value restarts, voting loading at rest`: `stillFrames` 3, no prev → sample 1,
    loading.
  - `a changed inputs key restarts at rest`.
  - `still and unchanged counts up at weight 1/n`: prev 3 → sample 4, weight 0.25, no restart.
  - `the cap-th sample draws and stops voting; the next frame holds without drawing`:
    - prev 15 → sample 16, draw, not awake, not loading;
    - prev 16 → sample 16, no draw.
  - `small caps at 8 with 64 steps`: prev 7 → sample 8, draw, steps 64; prev 8 → no draw.
  - `the jitter index is the frame index, moving or still`: frameIndex 1234 gives jitterIndex
    1234 on a restart and on a count-up. The regression it guards: indexing by the sample number
    freezes the grain while moving (`fragment.wesl`'s old temporal-seed note).
  - `nothing live: no draw and no votes, and going live restarts`: key `null` → no draw, not
    awake, not loading; then key `'k'` with that prev → sample 1, restart.
- [ ] `densityAccumulationKey.test.ts`:
  - `equal inputs give equal keys`: fresh copies of the same values.
  - `every settings member moves the key`:
    - Iterate `Object.keys` of a full `VolumeFieldSettings`.
    - Perturb each member: a number gets +0.01, a boolean flips, `paletteId` takes another
      palette id.
    - Expect a different key each time. A member missing from the key freezes the converged image
      on a slider change at rest, and iterating the keys covers a future member automatically.
  - `opacity, cube stamp and tier each move the key`.
- [ ] Implement both.
- [ ] `npm run typecheck:fast`, `npm test -- planVolumeAccumulation densityAccumulationKey`.

**Done when:** the fold and the key are pure, and every row of the table above is pinned by a test.

---

## Task 7: the accumulation planner, wired

**review: yes** (frame program order, retained-target landmine, Layer wiring)

**Files:**
- `src/layers/cosmicWebDensity/frame.ts` (create)
- `src/layers/cosmicWebDensity/layer.ts` (modify)
- `src/layers/cosmicWebDensity/densityCubes/passes/cosmicWebDensityPass.ts` (modify)
- `src/data/rendering/frameSections.ts` (modify: `SCENE`)
- `src/@types/engine/frame/PlannerResult.d.ts` (modify: doc of `loading` only, no shape change)
- `tests/layers/cosmicWebDensity/densityCubes/passes/cosmicWebDensityPass.test.ts` (create)

**Contract.**

```ts
// src/layers/cosmicWebDensity/frame.ts
export function cosmicWebDensityAccumulationPlanner(
  runtime: CosmicWebDensityRuntime,
): Extract<
  FrameContentPlanner<VolumeAccumulationPlan, 'cosmicWebDensity'>,
  { scope: 'perView' }
>;
// name: 'cosmic-web-density-accumulation', scope: 'perView', fade: 'cosmicWebDensity'

// cosmicWebDensityPass gains the planner handle (milkyWayFieldPass's pattern)
cosmicWebDensityPass(runtime, planner): ContentPass<'cosmicWebDensity'>
```

- **The planner's `plan(view, state, prev, fade)`:**
  - `live = deriveCosmicWebDensityLiveness(runtime, state, view, fade)`.
  - `inputsKey = live === null ? null : densityAccumulationKey(...)`, built from:
    - the ids `Object.keys(runtime.slots)`;
    - `live.settingsOf` and `live.fadeOpacityOf`;
    - `runtime.slots[id].committed()?.loadedAtMs ?? null`;
    - `state.tier`.
  - Returns `planVolumeAccumulation(prev, view, state, inputsKey)`.
  - It reads the same liveness the passes read, so it cannot disagree with them about which
    fields are live.
- **`layer.ts`:**
  - `planners: (runtime) => [cosmicWebDensityAccumulationPlanner(runtime)]`.
  - `passes` builds a second instance as the typed handle, with the comment at
    `milkyWay/layer.ts:43-44`.
  - The target row gains `retained: true`, with one comment line: the mean lives in the target
    across frames, per view.
- **`frameSections.ts` `SCENE`:**
  - `{ kind: 'plan', name: 'cosmic-web-density-accumulation' }` after `structure-markers` (plan
    lines lead the section, per `checkFrameOrder`).
  - The `cosmic-web-density` render line gains
    `restartPlanner: 'cosmic-web-density-accumulation'`.
  - Extend that line's comment by one clause: retained, restarted by the planner.
- **`cosmicWebDensityPass`:**
  - `liveness` returns `null` when `plans.get(planner, ctx).draw` is false, and otherwise
    `deriveCosmicWebDensityLiveness(…)`. At the cap the march stops and the step opens no pass,
    so the retained target is kept.
  - `inputs` returns `plans.get(planner, ctx).inputs`, replacing Task 5's stopgap.
  - The **upsample is untouched**: it keeps the plain liveness, so it composites the converged
    target at rest. It must never gate on `touched` or `renderedTargets` (prep plan, Risks).
  - The header says the march additionally gates on the plan's `draw`.
- **`PlannerResult.loading` doc** gains one clause: a still view's progressive image that has not
  converged (cosmicWebDensity) counts too.

Steps:

- [ ] Test `at the cap the march stops and the upsample keeps compositing`:
  - Fixture: a stub runtime with one live field, and a plans store whose
    `get(planner, ctx)` returns a plan with `draw: false`.
  - The density pass's `enabled` is false, and `cosmicWebDensityUpsamplePass`'s `enabled` is
    true.
  - With `draw: true`, both are enabled, and `draw` hands the plan's `inputs` to the renderer.
    The regression this guards: a converged volume vanishing at rest.
- [ ] Planner, Layer, frame order and pass, as above. `checkFrameOrder` runs at boot, and the
      existing frame-order tests cover the new plan line.
- [ ] `npm run typecheck:fast`,
      `npm test -- cosmicWebDensity checkFrameOrder frameOrderBoot executeFrame renderFrame`.
- [ ] Controller, after the commit (`npm run shot`, with the dev server's own `--url`):
  - inside pose mono, `#pose=a,-239.45,-16.5,201.3,0.5,0.3,30,0&layers=cosmicWebDensity,cosmicWebDensity:mcpm`,
    converged;
  - the same pose `?dome`, converged;
  - DebugPanel Memory shows `render-target-cosmic-web-density@<view id>` rows: one in mono, five
    in dome.

**Done when:** a still view converges and the loop sleeps at the cap, any change restarts, and a
moving view draws exactly one `n = 1` frame per frame.

---

## Task 8: Trim becomes a cut above the contrast deadband

**review: yes** (shader)

**Files:**
- `src/services/gpu/shaders/scalarVolume/fragment.wesl` (modify: `applyContrastWindow`, `:167-183`;
  the `trim` field doc, `:83-91`)
- `src/layers/cosmicWebDensity/sources/mcpm.ts`, `polyphorm-2mrs.ts`, `mcpm-workbench.ts`
  (modify: `trim: 0.3` → `trim: 0`)
- `src/@types/settings/VolumeFieldSettings.d.ts` (modify: `trim` doc)
- `src/layers/cosmicWebDensity/densityCubes/utils/clampVolumeTrim.ts` (modify: header semantics)

**Before / after.**

```wgsl
let deadband = max(contrastDeadband, trimDeadband);                       // before
let deadband = contrastDeadband + trimDeadband * (1.0 - contrastDeadband); // after
```

- **Why the look is unchanged.** All three sources ship `contrast: 1.7`. That is a deadband of
  0.41, which beat `trim: 0.3`, so trim was a no-op. With trim 0 the new formula gives exactly
  the contrast deadband, and the shipped image is unchanged.
- `clampVolumeTrim`'s [0, 0.95] range is unchanged. Trim now cuts that fraction of what survives
  the contrast deadband.

Steps:

- [ ] Shader line, three source defaults, three docs. Own commit.
- [ ] No test: a shader expression plus defaults. The owner check is in Task 10.
- [ ] `npm run typecheck:fast`, `npm test -- cosmicWebDensity`.

**Done when:** Trim visibly cuts from just above 0, and at trim 0 the image matches Task 7's.

---

## Task 9: `docs/RENDERER.md`, COSMO full-screen rays and progressive volume sampling

**Files:** `docs/RENDERER.md` (modify)

- **Line 81 (the unprojection landmine).** It says to reconstruct full-screen rays through
  `invMvp * vec4(xy, 0, 1)`, and does not say this holds only on the **reversed-Z** NEAR0 and
  body slabs (`lib/sceneDepthRay.wesl`). Rewrite it to keep the NEAR0 rule and add the COSMO
  case:
  - COSMO is forward-Z (near 0.01 Mpc, far 50 Gpc). Its f32 vp's depth row equals its w row to
    within one ulp.
  - So any unprojected point, at z = 0 or z = 1, puts `p − cam` into f32 cancellation. The
    spike measured 1.5–3.8 px image jumps per zoom step, worse far from the origin.
  - Build a COSMO full-screen ray from the inverse of the 3 × 3 formed by the vp's x, y and w
    rows (no depth row, no translation), applied to `(ndc.x, ndc.y, 1)`, with origin = the
    camera.
  - The density march needs neither form: it rasterises the cube's back faces, so its ray is the
    interpolated world position minus the camera.
- **New bullet, "Progressive volume sampling":**
  - The `cosmic-web-density` row is `retained`: one texture per view id, allocated and freed by
    `reconcileViews`, and cleared on (re)allocation.
  - The per-view `cosmic-web-density-accumulation` planner folds its previous value (`prev`, kept
    one frame by the plan runner) with `FrameView.stillFrames` and an exact inputs key.
  - Its `restart` drives the executor's first-touch clear through the render line's
    `restartPlanner`.
  - A frame below the cap draws one decay triangle `(zero, one-minus-constant)`, then every field
    `(constant, one)` at `w = 1/n`.
  - At the cap the march opens no pass and the upsample keeps compositing the retained mean.
  - The trap: a retained target is current while untouched, so its consumers must not gate on
    `touched` or `renderedTargets`.
  - Below the cap it votes `awake`, and `loading` only at rest.
  - Keep the bullet to the file's density, citing paths, not code.
- [ ] No test (docs).

**Done when:** the unprojection advice names its slab and the COSMO form, and the progressive
scheme has a renderer-map entry.

---

## Task 10 (controller): timing bench, image checks, owner checks

No commit except the ledger. Every scratch patch here is local, applied to both sides alike, and
**never committed** (leanness.md: `// delete when Task 10 is done`).

1. **Timing (spec §8; perf skill).** `npm run perf` and per-layer slots are not used: they failed
   the control for this pass on the Apple GPU (spec §2). Instead:
   - **Rig.** Paired-baseline A/B per the perf skill. Base is `main` at `61e001926` in a scratch
     worktree with `node_modules` and `public/data` symlinked, on its own dev server; tip is
     this branch. Alternate A-B-A-B; never all-A then all-B.
   - **Bench patch, both sides.** Inside the renderer's field loop, draw each field `K` times.
     Boot `?perf`, `setStrategy('merged')`, `setPose` to the bench pose, and collect 240 rAF
     deltas per run.
   - **Controls, all of which must pass before a number is quoted:**
     - **no-op floor:** the same pose with `layers=-cosmicWebDensity`;
     - **K-doubling:** `(T(16) − T(off)) ≈ 2·(T(8) − T(off))` within 15%;
     - **repeat:** ≥ 5 rounds, quoting the median and spread.

     Per-draw cost is `(T(K) − T(off)) / K`.
   - **Poses:** inside, `a,-239.45,-16.5,201.3,0.5,0.3,30,0`; outside, `a,0,0,0,0.6,0.3,600,0`.
     Both fields on, at `medium` and `large` (switched in the Settings panel, because `?tier=`
     does not stick, spec §10).
   - **Moving:** auto-rotate on, so every frame restarts. **Pass** if tip's per-draw cost is
     within base's round-to-round spread, or ≤ +5%. The one added read per fragment is the
     mask's `textureLoad`, outside the step loop (feedback: count every added read).
   - **At rest:** **pass** if the frames after the cap read the volume-off floor (the march opens
     no pass), and accumulation frames cost ≤ the moving cost plus one untextured full-target
     triangle.
   - **OnePlus:** the same pair through `npm run phone` if the phone is attached. Otherwise it is
     listed as owed in the ledger and the PR body.
   - **Result:** a table in the ledger and the PR body. A regression halts the pipeline and goes
     to the owner (leanness.md).
2. **Converged equals the mean.** A scratch patch forces `restart` every frame at a fixed pose and
   saves 16 consecutive single-sample frames. Their mean is compared with the converged shot at
   the same pose, `medium`.
   - **Pass:** 8-bit RMS ≤ 0.5. The noise floor is ≈ 0.3 (spec §2); the two differ only by f16
     rounding and the cycle shift.
   - The first frame after a move equals a single-sample frame at that jitter index (same patch,
     RMS ≈ 0).
3. **Registration (the ray-direction finding).** At `a,0,0,0,0.6,0.3,600,0` and
   `a,0,0,0,0.6,0.3,2000,0`, take converged shots at 5 dolly steps of 1% distance each.
   - The volume scales about the screen centre with the galaxies.
   - **Pass:** residual shift ≤ 0.1 px after rescaling (phase correlation). The spike measured
     0.01 px on the fixed path and 1.5–3.8 px on the broken one.
   - Send the gif to the dash.
4. **Dome.** `?dome#pose=a,-239.45,-16.5,201.3,0.5,0.3,30,0&layers=cosmicWebDensity,cosmicWebDensity:mcpm`,
   converged. All five faces carry the volume with no seam, and no face's mean bleeds into
   another.
5. **Owner checks (dash, one check per item, before LEFT, after RIGHT):** the DoD smoke list
   below, at `large`, rest and motion per pose.

---

## Risks

- **Dome VRAM.** The retained row allocates one texture per view. In dome that is five 1/3-scale
  `rgba16float` face textures where today there is one. Example: a 2048² face is about 3.7 MB
  each, so about 15 MB more. It shows in the Memory section, as Task 7's check verifies.
- **The idle tail.** Each stop re-renders the whole scene for up to 16 frames (8 on `small`).
  That is the ruled price (ask HGXr). It applies only while a field is live (the `null` row
  votes nothing).
- **Exact rest.** `stillFrames` compares the f32 `vp` exactly, which is right for this reader:
  the march's GPU inputs are `vp` and the f32 eye. A camera that dithers by an ulp would never
  converge. `stepNavigator`'s rest snap rules that out (prep plan).
- **The tour's cold-load gate** (`visitBeatSaga.ts:130-140`) now waits up to 16 frames longer on
  the first beat's landing, while the volume converges.

## Deviations from the spec

1. **Mask delivery.** The Layer fetches the mask in `create`, and slot commits wait for it. The
   spec's "handed to the Layer" would add a `LayerCoreDeps` member (Layer contract). See "Needs
   the owner's ruling" 1.
2. **Mask source.** We build our own, with a void-and-cluster builder in `tools/lut/`. NVIDIA's
   STBN licences forbid bundling. This is the fallback spec §10 names, so the open item closes.
3. **Shots wait only at rest.** The planner votes `loading` below the cap only when
   `stillFrames > 0`. The spec's unconditional "shots and `settled()` wait for the cap" would hang
   `settled()` under auto-rotate, which `tools/shot/README.md` promises never holds a shot.
   See "Needs the owner's ruling" 2.
4. **The cap stops the march through its liveness.** At the cap, the density pass's liveness
   returns `null` when the plan says `draw: false`, and the upsample keeps the plain liveness. The
   spec does not say how the volume "draws nothing more". This route changes no core type.
5. **No decay draw at weight 1.** The spec draws one decay per frame. On a restart frame it is a
   no-op after the executor's clear, so it is skipped, and moving frames keep today's GPU work.
6. **The plan has a `null` key.** `inputsKey: string | null`, where `null` means nothing is live:
   no draw and no votes. Without it, a stop with the volume off would re-render 8–16 frames for
   nothing.
7. **Mask layout and jitter form.** The 64 × 64 × 16 mask is stored as one 64 × 1024 `r8unorm`
   2D texture, and its dimensions are read in the shader through `textureDimensions`. The jitter
   is `fract(mask + cycle·φ)` with `cycle = jitterIndex / 16`. The spec names only the mask's
   size.
8. **Names.** The tables are `DENSITY_MARCH_STEPS_BY_TIER` and `DENSITY_SAMPLE_CAP_BY_TIER`. The
   spec's names were `STEPS_BY_TIER` and `SAMPLE_CAP_BY_TIER`; the prefix keeps the existing
   `DENSITY_MARCH_STEPS` stem.
9. **Website copy.** The `render-density-march` fact reads "up to 128 steps", since spec §4.1's
   "§5's tier table later" now applies. No accumulation claim is added to the site.
10. **Timing on the OnePlus** is conditional on the phone being attached. Otherwise it is recorded
    as owed.

## Definition of Done

**Deliverable inventory**
- `public/lut/blueNoise.bin` (64 × 64 × 16 r8). `tools/lut/blueNoiseMask.ts` and
  `buildBlueNoiseMask.ts`. `npm run build-blue-noise-mask`. `BLUE_NOISE_MASK_SIZE` and
  `BLUE_NOISE_MASK_SLICES`.
- `createBlueNoiseMask`, `BlueNoiseMask`, `CosmicWebDensityRuntime.jitterMask`, and slot commits
  that wait for it.
- `createVolumeFieldRenderer(deps: VolumeFieldRendererDeps)`, the mask at group 0 binding 5, and
  no `hash21Hq` jitter.
- `decay.wesl` and the decay pipeline: one draw per `draw` call below weight 1.
- `DENSITY_MARCH_STEPS_BY_TIER` and `DENSITY_SAMPLE_CAP_BY_TIER`; `DENSITY_MARCH_STEPS` is gone.
- `VolumeAccumulationPlan`, `planVolumeAccumulation`, `densityAccumulationKey`, and
  `cosmicWebDensityAccumulationPlanner`.
- `cosmic-web-density` is `retained: true`. The SCENE plan line and the render line's
  `restartPlanner` are in place.
- The trim formula and `trim: 0` defaults.
- `docs/RENDERER.md` has the COSMO ray form and the progressive-sampling bullet.
- The Task 10 timing table is in the ledger and the PR body.

**Smoke pass.** Deep links are shot with `npm run shot -- '<link>' --url <this worktree's
server>`. These checks are the owner's.
- **One field, outside, 600 Mpc,**
  `#pose=a,0,0,0,0.6,0.3,600,0&layers=cosmicWebDensity,cosmicWebDensity:polyphorm-2mrs,-cosmicWebDensity:mcpm`:
  at rest the grain melts into a smooth image within about 16 frames and the loop then sleeps;
  dragging shows today's single-frame grain, with no streaks and no ghost on stop.
- **Both fields,**
  `#pose=a,0,0,0,0.6,0.3,600,0&layers=cosmicWebDensity,cosmicWebDensity:mcpm,cosmicWebDensity:polyphorm-2mrs`:
  MCPM-only pixels are as bright with 2MRS on as with it off (the spike's −65% bug is gone).
- **Zoom at 600 and 2000 Mpc** (`…,600,0` and `…,2000,0`): scrolling the zoom in steps, the
  converged volume does not jump or swim against the galaxies.
- **Inside the cube,** `#pose=a,-239.45,-16.5,201.3,0.5,0.3,30,0&layers=cosmicWebDensity,cosmicWebDensity:mcpm`:
  it converges at rest and filaments read thinner than a single frame.
- **Change at rest:** an intensity, palette or trim change at rest restarts and re-converges; a
  field toggle's fade restarts every frame of the fade and converges after it.
- **Trim:** the slider cuts visibly from just above 0. At 0 the image matches the shipped look.
- **Resize:** resizing the window at rest restarts at the new size with no console error, then
  converges.
- **Tier switch** (Settings panel), medium ↔ large ↔ small at rest: it restarts on the switch and
  again when the new cube commits. `small` converges in 8 frames with 64-step grain while moving.
- **Dome:** `?dome#pose=a,-239.45,-16.5,201.3,0.5,0.3,30,0&layers=cosmicWebDensity,cosmicWebDensity:mcpm`:
  five faces converge, with no seam or cross-face bleed.
- **Shots:** `npm run shot` of a still pose returns a converged image. With auto-rotate on it
  still returns (it does not hang).
- **Volume off:** stopping the camera with the volume off renders no extra frames (the loop
  sleeps as on main).
- **Memory:** DebugPanel Memory lists `render-target-cosmic-web-density@…` once per view.

**Deferral boundary (out of scope).** Compressed half-res cubes, mips, the full-res detail region,
the brick atlas, and any spike debug panel or URL knob. Also out of scope: reprojection and motion
vectors, step counts that differ between rest and motion, the dust volume, and a `?tier=` deep-link
param.
