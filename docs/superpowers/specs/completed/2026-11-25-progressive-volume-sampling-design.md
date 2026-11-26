# Progressive volume sampling: design spec

> **Status.** Draft, 2026-11-25. Owner: Alexander Rulkens. Shape signed off at the ground check the
> same day (dash asks gZeY, DXEW, XWoV): ships as its own PR ahead of any full-resolution storage
> work; prep lands first as a separate PR; planners receive their previous value from the engine.
> **Written against** main at bfff3d7d8, and against the post-prep architecture of §4 as if it
> already existed.
> **Inputs.** Three throwaway spikes on 2026-11-25 (numbers in §2) and two literature passes
> (§9). The spike code is not a base for this work.

## 1. Why

The cosmic-web density volume marches 128 fixed steps per pixel with a per-frame hash jitter, into
a 1/3-scale target. Each frame stands alone: at rest the loop sleeps and the image keeps whatever
noise that one frame had. Stride is 5–10 voxels at the `large` tier, so a single frame under-samples
thin filaments however fine the data is.

Averaging frames while the view is unchanged turns the jitter into Monte Carlo integration: the
image converges at rest for no extra per-frame cost. That is worth shipping alone, and every later
route to full-resolution data (compressed dense texture, camera-centred window) depends on it,
because finer data only shows once the stride noise is averaged out.

## 2. What the spikes measured

- **Convergence** (RMS vs each run's own 64-sample mean, 8-bit units, floor ≈ 0.3):

  | Steps / jitter       | 1 frame | 4    | 16   |
  | -------------------- | ------- | ---- | ---- |
  | 128, hash (today)    | 1.20    | 0.70 | 0.47 |
  | 128, blue noise      | 0.94    | 0.51 | 0.38 |
  | 64, blue noise       | 1.97    | 0.81 | 0.46 |
  | 32, blue noise       | 3.86    | 1.41 | 0.62 |

- **Motion.** Any frame averaging without reprojection is motion blur: 4 or 8 frames streak
  filaments, and inheriting the moving average on stop leaves a ghost. Owner ruling: no averaging
  while the view changes; the mean restarts on the first unchanged frame.
- **Cost.** The target can be its own history through the blend constant: no extra pass, no extra
  texture per view beyond the target itself.
- **Timing caveat.** `npm run perf` slots and per-layer GPU timestamps failed a control on the
  Apple GPU (a skipped march read the same as a full one). Volume A/B timing uses the wall-clock
  bench of §8.

## 3. Behaviour

1. **Jitter.** The march's start offset comes from a spatiotemporal blue-noise mask indexed by
   pixel and by the engine frame index, replacing `hash21Hq(fragCoord + frame·k)`. The index is
   never the accumulation sample number (§4.1).
2. **Accumulate while unchanged.** For each view, while its camera, its size, the fields' settings,
   their fade opacity, the tier and the loaded cubes are all unchanged, frame `n` is blended into
   the target with weight `1/n`. The target then holds the mean of `n` jittered marches.
3. **Restart on change.** Any change gives `n = 1`: the target is cleared and holds that one frame,
   exactly as today. Nothing is averaged across a change.
4. **Cap and sleep.** At `n = SAMPLE_CAP_BY_TIER[tier]` (`{ small: 8, medium: 16, large: 16 }`) the
   volume draws nothing more. Every accumulation frame re-renders the whole scene, so the cap is
   the number of full frames after a stop; most of the gain lands by 8–16 (§2). The upsample
   keeps reading the converged target and the loop may sleep.
5. **Wake.** While any view is below the cap the Layer votes `awake`.
6. **Per view.** The canvas and each dome face keep their own mean.
7. **Step count per tier.** `STEPS_BY_TIER = { small: 64, medium: 128, large: 128 }`; one count per
   tier, moving or still. `small` drops to 64 because rest converges and the owner passed 64-step
   grain in motion.

Shots and `settled()` wait for the cap, so a shot is a converged image. The recorder moves the
camera every frame, so recorded frames are `n = 1`, as today.

## 4. Ground preparation

Prep is its own PR of behaviour-neutral commits, in this order. Verdicts come from the ground
check; the greenfield cross-check derived the same shapes from requirements alone. The plan-time
code trace and the owner's rulings of 2026-11-25 settled the rest.

1. One shared WESL struct-layout test helper (§4.4).
2. The volume renderer takes its inputs (§4.1).
3. The star planner reads the engine frame index (§4.5).
4. A target row can be retained, in render targets (§4.2).
5. The executor honours retained rows (§4.2).
6. Per-view planners fold (§4.3).
7. Views report stillness (§4.3).

### 4.1 The volume renderer takes its jitter index, step count and weight as inputs

Today `volumeFieldRenderer.ts` keeps `let frame = 0` and advances it per draw, so a dome frame
advances it five times, and `fragment.wesl` fixes `const STEP_COUNT: i32 = 128`.

```ts
export type VolumeFieldDrawInputs = {
  /** Index into the jitter sequence: the engine frame index. */
  jitterIndex: number;
  /** March steps per ray. */
  steps: number;
  /** Blend constant each field's march is scaled by as it adds into the target; 1 = plain additive. */
  weight: number;
};
```

The jitter index is always the engine frame index, decoupled from the accumulation sample number.
A moving camera restarts on every frame, so an index taken from the sample number would be 0 on
every moving frame and freeze the noise to the screen: the failure `fragment.wesl:216-224` records.
At rest the frame index still advances once per frame, so successive samples differ.

`draw` gains that argument. `weight` is the blend constant (the field pipeline blends
`(constant, one)`), not a uniform. The uniform block therefore grows by `steps` alone, from 256 to
272 bytes: 260 rounded up to the 16-byte mat4 alignment. Passes read `frameIndex` from `PassState`,
which gains it. The scalar-volume pass row gains `inputs(state, ctx)`, so the Layer, not core, owns
the step count. In prep the cosmic-web row returns
`{ jitterIndex: state.frameIndex, steps: 128, weight: 1 }`. At weight 1 the blend is exactly
today's additive one, so pixels change only where the jitter phase did (a dome frame used to
advance it five times). The docs fact that parses `STEP_COUNT` reads the Layer's step constant
instead, and §5's tier table later.

### 4.2 A target row can be retained

```ts
export type RenderTargetSpec = {
  // … existing members …
  /** Keep contents across frames: one texture per view id, cleared on (re)allocation
   *  and whenever the drawing step's planner value says `restart`. */
  retained?: true;
};
```

- `renderTargets` keys a retained row's textures by `(id, view id)`. Rows without the flag are
  untouched.
- `reconcileViews(state, viewIds)` runs once per frame, right after the views are derived. It
  allocates a texture for each new view id and frees the textures of ids absent from the frame.
  `reconcile` cannot do this: it runs before any view exists, and it cannot move later, because
  the dome's view specs read the reconciled `dome-cube` row.
- `renderTargets` clears a retained texture to its row's clear value whenever it (re)allocates it.
  The executor therefore needs no "just allocated" fact.
- The executor's `touched ? load : clear` gains one input for retained rows: load unless the render
  step's plan value says `restart`. The step names the planner whose value carries that flag; no
  target id is special-cased.

### 4.3 Per-view planners fold; views report stillness

```ts
// FrameContentPlanner, the 'perView' arm only. `prev` sits before the `...fade` rest tuple:
// TS allows nothing after a rest parameter.
plan(view: FrameView, state: PassState, prev: T | undefined, ...fade: FadeParam<K, ShowKey>): PlannerResult<T>;

export type FrameView = {
  // … existing members …
  /** Frames since this view id's view-projection or size last changed; 0 on the frame it changed. */
  stillFrames: number;
};
```

- The plan runner keeps last frame's per-view values privately, keyed by planner name and view id,
  and hands each back as `prev`. It holds one frame: a view id absent from a frame has no `prev`
  when it returns. The result store's public type is unchanged, so no pass can reach last frame's
  values.
- Once-scope planners and their type arm are untouched; §5's only reader is per-view.
- Core fills `stillFrames` by comparing consecutive derivations of the same view id. The comparison
  is exact. `stepNavigator` snaps velocities below `NAV_REST_EPS` to zero (`stepNavigator.ts:89-96`),
  and the spike accumulated at rest. No epsilon.
- The 10 existing planners in 8 Layers ignore `prev`. The one per-view planner (structure markers)
  takes it as an unused parameter.

### 4.4 One shared WESL struct-layout test helper

The parity tests for black-hole lensing, the atmosphere, surface tiles and asteroid points, and the
scene workbench's camera test, each carry their own copy of a std140 struct parser. One helper
under `tests/helpers/` replaces all five copies. The change is test-only and lands before §4.1 adds
a parity test of its own for the 272-byte block.

### 4.5 The star planner reads the engine frame index

`starCatalogPlanner` counts its own calls in a closure. The count drives its chunk-plan cadence and
serves as the chunk pool's LRU clock. The planner reads `state.frameIndex` instead, which §4.1 puts
on `PassState`. The values match frame for frame: the planner's plan line runs once per rendered
frame in both rigs, after `renderFrame` increments the frame index, and neither count ever resets.
Being once-scope, it cannot use `prev`.

## 5. The feature, on that ground

```ts
export type VolumeAccumulationPlan = {
  /** Everything outside the view that invalidates the mean: settings, fades, tier, cube versions. */
  inputsKey: string;
  /** 1-based sample number this frame; 1 means restart. */
  sample: number;
  restart: boolean;
  /** False once the cap is reached. */
  draw: boolean;
  /** `jitterIndex` = the frame index, `steps` = `STEPS_BY_TIER[tier]`, `weight` = `1 / sample`. */
  inputs: VolumeFieldDrawInputs;
};
```

- **Planner** (per view, in `src/layers/cosmicWebDensity/`): `sample = 1` when
  `view.stillFrames === 0`, `prev` is missing, or `prev.inputsKey !== inputsKey`; otherwise
  `prev.sample + 1`, held at the cap. It votes `awake` while `sample < SAMPLE_CAP_BY_TIER[tier]`.
  `sample` sets only the weight and the cap. The jitter index stays the frame index, moving or
  still (§4.1).
- **Target row:** `cosmic-web-density` gets `retained: true`.
- **Blend, one state for every field.** With `w = 1/sample`:
  1. a decay draw (full-target triangle, no texture) with blend `(zero, one-minus-constant)` leaves
     `dst·(1−w)`;
  2. every field draws with blend `(constant, one)`, adding `w·field`.

  The result is `dst·(1−w) + w·Σ fields`. On restart the target is cleared first (so `Inf`/`NaN`
  cannot survive a multiply by zero) and `w = 1` reproduces today's image. No field is treated
  differently from another.
- **Blue-noise mask:** a 64×64×16 scalar mask (64 kB) beside `public/lut/envBrdf.bin`, loaded the
  same way and handed to the Layer. Source is an open item (§10).
- **Tier tables** (`STEPS_BY_TIER`, `SAMPLE_CAP_BY_TIER`) live in the Layer's `data/`.

## 6. Trim slider fix

`deadband = max(contrastDeadband, trim)` makes Trim a no-op below `1 − 1/contrast` (0.41 at the
default contrast 1.7, against a default trim of 0.3). Trim becomes a cut applied above the contrast
deadband:

```wgsl
let deadband = contrastDeadband + trim * (1.0 - contrastDeadband);
```

Source defaults change from `trim: 0.3` to `trim: 0` so the shipped look is unchanged. Own commit on
the feature PR.

## 7. Not in scope

- Lower step counts at rest than in motion. One count per tier until a measurement asks for more.
- Reprojection, motion vectors, denoising. Rejected: fly-through ghosting.
- Full-resolution data, compression, camera-centred windows. Separate effort; the value test is
  running.
- The dust volume. It reuses this sampler when its renderer slice starts.

## 8. Verification

- **Unit:** the planner as a fold (restart on each key change, cap, wake vote); retained-target
  allocation and eviction per view id; executor load/clear for retained rows; `stillFrames`.
- **Image:** converged shot equals the mean of that tier's cap of single-sample shots within the
  noise floor;
  first frame after a move equals today's frame at the same jitter index.
- **Dome:** five faces converge independently; no cross-face bleed.
- **Timing:** volume-only wall-clock bench (K draws per submit; no-op, K-doubling and repeat
  controls must pass) at the inside pose, before and after, on the Mac and the OnePlus.
- **Owner checks:** rest and motion at `large`, in the dash, per pose.

## 9. Sources

Kettunen et al. 2021 (jittered marching has 7–30× lower variance per fetch than ratio tracking for
this kind of medium); Wolfe et al. 2022 (spatiotemporal blue-noise masks, good without
reprojection); Hofmann et al. 2021 (motion vectors gave volumes no clear benefit).

## 10. Open items

- **Blue-noise source.** NVIDIA publishes STBN masks; their licence must be read before bundling.
  Otherwise a `tools/lut/` builder generates one, as `buildEnvBrdfLut.ts` does for its table.
- **Idle tail.** Ruled 2026-11-25 (ask HGXr): 8 full frames after a stop on `small`, 16 on
  `medium` and `large`; 32 was judged too much for what it buys. Ask fTey confirmed the per-tier
  step counts and the
  trim change.
- **`?tier=large` does not stick** after boot, so the spike's early shots were probably `medium`.
  Whether a deep-link tier param should exist is a separate question.
