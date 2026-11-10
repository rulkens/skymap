# The v2 Milky Way field in the `milkyWay` Layer: design spec

**Brief:** `docs/backlog/2026-09-25-milky-way-v2-field-in-layer.md`, which this spec replaces and deletes. It holds the
rulings of 2026-09-25 and the first refactor-ground pass. **Research:** `docs/research/milky-way/` (the analytic field,
dust, HII regions) and `docs/research/engine/decisions.md` (Track C). **Checkpoint:** refactor-ground, re-run on
2026-11-09 against main at `8c611fc80` and signed off on 2026-11-10. This spec is written against the architecture as it
will be after the prep in §9.

## 1. Goal and non-goals

The app can draw the v2 analytic Milky Way field (`renderers/galaxyField/`, `galaxyGenerator/v2/`) in the `milkyWay`
Layer, beside the v1 sprite cloud. A DebugPanel-only switch `renderer: 'v1' | 'v2' | 'both'` picks between them and
defaults to `'v1'`, so with the default nothing a user sees changes. The tool (`tools/galaxy-renderer`) and the app drive
one shared host.

Non-goals:

- Deleting v1. That comes after the comparison, as its own effort.
- The Edenhofer dust volume, which is gated on this landing (see the `project_milky_way_smooth_field` memory).
- Moving the field onto the declarative frame program, which hasn't landed yet. This builds on today's hand-written frame
  order.
- Porting the tool's deep tuning surface into the app.
- A split-screen comparison.
- Making the field the default.

## 2. Rulings

From 2026-09-25 (the brief):

- **The switch.** `renderer: 'v1' | 'v2' | 'both'` lives in the DebugPanel only, defaults to `'v1'`, and has no
  split-screen.
- **v1 dust and v2.** v1's dust is off whenever v2 is on.
- **Scope.** v2 brings everything the tool draws: emission, the dust map, the HII tiers, extras, and the arm and spur
  clouds.
- **One shared host,** promoted from the tool into `src/`.
- **App knobs:** exposure, dust on/off, and a divisor per target.

From 2026-11-10 (the checkpoint):

- **Settings are nested,** in `cloud` and `field` groups, named for their concern modules (§6).
- **In `'both'`, the light sums.** Each renderer draws at full weight, so each term matches its solo mode exactly.
- **The shape is signed off:** `FieldView`, targets as `{ view, sizePx }`, and the host in `src/` with one frame plan.
- **The whole v2 engine moves into the Layer,** as the concern module `src/layers/milkyWay/field/`, beside `cloud/`.
  That covers the renderer, the v2 generator, the host, and every type and helper only the field reaches. This
  overrides the "keep it in core" option. Engine decision #5 means it moves back out if galaxyCatalog ever adopts it.
  Shaders stay in `services/gpu/shaders/milkyWay/` (ADR 0014). `galaxyGenerator/v1/` and `shared/` stay in core, and so
  do the generic helpers `gaussian` and `alignedBytesPerRow`. The tool imports the engine from the Layer.
- **Three PRs.** PR 0 is the move alone, merged first. PR A is prep 1–3 plus splitting the multi-function builders.
  PR B is the settings prep and then the feature (§10).

Paths: the code this spec quotes is cited at its current, pre-move path. After PR 0, `renderers/galaxyField/**`,
`galaxyGenerator/v2/**` and the field-only `@types/galaxy` and `utils/galaxy` files live under
`src/layers/milkyWay/field/`, in the sub-modules of the approved module map (`header`, `mixture`, `arms`, `dust`,
`starFormation`, `ismMap`, `dustCdf`, `placement`, `probe`, `host`).

## 3. The field camera: `FieldView`

```ts
// src/@types/galaxy/FieldView.d.ts
export type FieldView = {
  readonly eye: Vec3; // galaxy frame: centre at the origin, disc in xz, +Y the pole, model units
  readonly right: Vec3;
  readonly up: Vec3;
  readonly fwd: Vec3; // galaxy frame, unit length, pointing into the screen
  readonly frustum: ViewFrustum; // unchanged by the placement: a rotation plus uniform scale keeps angles
};
```

- **Where it comes from.** `deriveFieldView(frame: FrameView, toGalaxy: Mat4)` takes the world eye and basis to the
  galaxy frame with `toGalaxy`, the inverse of the galaxy's model matrix.
  - The app passes the inverse of `milkyWayModelCached`, which is consistent with `milkyWayCamPosModel`.
  - The tool passes the identity, with its symmetric frustum built from `fov`, `aspect` and `shiftX`. Because the tool's
    frustum carries the same three numbers, its image stays pixel-identical.
- **What `GalaxyFieldFrame` loses.** It drops `eye`, `fov` and `shiftX`, and `FieldHeaderFrameLanes` drops `view` and
  `aspect`. `GalaxyFieldFrame` gains `camera: FieldView`.
- **Header layout.** The field header's `params` lane becomes the four tangents, `(tanLeft, tanRight, tanDown, tanUp)`.
  `exposure` moves to a lane the plan names, and the plan carries the byte table.
- **Shader functions.** `cameraRayFromUv` (`lib/camera.wesl`) and `splatNdc` (`lib/splatSilhouette.wesl`) take a
  `vec4` of frustum tangents in place of `(tanHalfFov, aspect, shift)`. Their five callers change with them.
- **Not changed.** The shared `CameraUniforms` prefix. That prefix is a world-space `viewProj`, while every field pass
  builds rays in the galaxy frame. The two consumers share their input, `FrameView`, not a GPU struct.

## 4. Field targets: `{ view, sizePx }`

```ts
// src/@types/galaxy/FieldTarget.d.ts
export type FieldTarget = { readonly view: GPUTextureView; readonly sizePx: Size };

// GalaxyFieldRenderTargets, reshaped
export type GalaxyFieldRenderTargets = Readonly<Record<FieldTargetId, FieldTarget>> & {
  readonly dustView?: FieldTarget; // debug only; absent means the dust-view pass never encodes
};
```

- **One key set.** The targets record, the divisors and the target rows are all keyed by `FieldTargetId`, and every
  HII label is `` `hii:${id}` `` for `extras | shells | young | dig`. There is no translator between ids, segment labels
  and tool slot names; the tool derives its timing slot names from the id in one place.
- **The renderer side.** The renderer reads sizes from `sizePx` and binds `view` directly, with no `createView()` per
  pass. Its two caches that key on texture identity, the dust map in `encode` and the one in `createFieldPipelines`,
  key on the view instead. A view stays the same object until its target is reallocated, which is the same guarantee
  `RenderTargets.viewOf` gives.
- **The tool side.** The tool keeps its own textures. It builds one view per allocation. Its probe readbacks still read
  its textures.

## 5. The host

**Home:** the sub-module `src/layers/milkyWay/field/host/`:
- `subsystems/createGalaxyFieldHost.ts`, which returns `{ host, debug }`
- `@types/`: `GalaxyFieldHost`, `GalaxyFieldHostDebug`, `FieldFramePlan`, `FieldTargetId`, `FieldHostTuning`
- `render/`: the readback stream
- `utils/`: `decodeIsmMapTexels`
- `data/`: `DUST_MAP_FORMAT`

This replaces the brief's `galaxyField/host/`.

```ts
export type GalaxyFieldHost = {
  /** Rebuild whatever the ISM chain finds stale; issue the readbacks that land. Once per frame, never per view. */
  ensureFresh(): void;
  /** Which targets this frame encodes. A function of the host's packed mixture, never of a flag set during encode. Called once per frame, by the planner. */
  plan(): FieldFramePlan;
  encode(
    encoder: GPUCommandEncoder,
    plan: FieldFramePlan,
    camera: FieldView,
    targets: GalaxyFieldRenderTargets,
    claim: ClaimTimestampWrites,
  ): void;
  setTuning(tuning: FieldHostTuning): void;
  destroy(): void;
};

export type FieldTargetId = 'field' | 'dustMap' | 'extras' | HiiTier; // 'extras' = background extras' HII
export type FieldFramePlan = {
  /** Encoded this frame, in encode order. */
  readonly encodes: readonly FieldTargetId[];
  /** Upsampled into HDR this frame. Derived from `encodes`, never re-derived. */
  readonly composites: readonly FieldTargetId[];
};
```

- **One plan.** Today the tool calls `findHiiSegment` once to gate each pass and again to gate the composite
  (`createGalaxyEngine.ts:515`), and only a comment keeps the two lookups in step. With `FieldFramePlan`, both the
  encode and the composite read one value, so they can't drift. The plan is a uniform filter over the target ids; it has
  no `analyticField` input, because the tool gates on its own switch and the app gates on the host's absence.
- **The plan travels as the planner's value.** `milkyWayPlanner` calls `plan()` once per frame, after `ensureFresh`,
  and returns `{ host, plan } | null`. The compute and the composite pass read that value with
  `ctx.snapshot.plans.get(planner, ctx)`, the way `createStructureMarkersPass` reads its planner. Nothing calls
  `plan()` a second time, and no purity contract is needed.
- **The host's type is the app contract.** `GalaxyFieldHost` has no `renderer` or `readbacks` member. What only the tool
  uses (the renderer handle for overlays, probe, ISM texture, counts and segments, and the readbacks for orientation
  and ring means) comes back as `debug: GalaxyFieldHostDebug` beside the host. The app ignores it.
- **One tuning row.** `FieldHostTuning` holds no tool-only switch. The neutral debug lanes (debug views zero, galaxy
  weight 1, ISM channels 1, seeding zero) live in the calibration row, and both the tool and the app spread it, so the
  app hand-builds no inert lane.
- **What moves out of the tool:**
  - from `createGalaxyModel.ts`: the v2 half, which is `mixtureInput`, `setFieldTuning`, `invMeanNormFor` and the
    ISM readback wiring. The v1 sprite half stays in the tool.
  - from `deriveFrameView.ts`: the frame-lane half, including `FIELD_EXPOSURE_GAUGE`.
  - `createIsmMapReadbacks`, `createReadbackQueue` and `decodeIsmMapTexels`.
  - `encodeSceneComposites`, which becomes the composite loop.
  - `DUST_MAP_FORMAT`.
  - the field rows of `defaultRenderSettings.ts`, as one calibration row in `field/data/` that both the app and
    the tool read.
- **The ISM readback is required, not a diagnostic.** It sets `youngStars.invMeanNorm`. The stale "Diagnostics-only"
  doc at `createGalaxyModel.ts:448` is corrected as it moves.
- **Before the first readback.** Until the first readback lands, `invMeanNorm` is 1, the same identity the tool shows
  today. A landing calls `requestRender`, because the app renders only on demand. If the first-light check (§8) shows a
  visible pop, the calibration row gains a seed value. Otherwise nothing is added.
- **What stays in the tool:**
  - `deriveMilkyWayFade` (the app has its own alpha, §7);
  - the probes and presets;
  - the orientation diagnostics;
  - the v1 sprites;
  - its own deep tuning surface, which feeds `setTuning` with the full `FieldHostTuning`.

## 6. Settings

```ts
export type MilkyWaySettings = {
  enabled: boolean;
  labelEnabled: boolean;
  renderer: MilkyWayRenderer; // 'v1' | 'v2' | 'both', default 'v1'
  cloud: MilkyWayCloudTuning; // today's eight knobs, unchanged
  field: MilkyWayFieldTuning;
};
export type MilkyWayFieldTuning = {
  readonly exposure: number;
  readonly dust: boolean;
  readonly divisors: Readonly<Record<FieldTargetId, number>>;
};
```

- **Setters.** `setMilkyWayTuning` becomes `setMilkyWayCloudTuning`, which merges into `cloud`. A new
  `setMilkyWayFieldTuning` merges into `field`, and a new `setMilkyWayRenderer` sets `renderer`.
- **Slider tables.** One table per group, keyed by `keyof` that group. The divisor rows are generated from the
  `FieldTargetId` list.
- **No migration.** Nothing persists the slice (there is no `localStorage`, and tour snapshots are in-memory), so moving
  the knobs breaks no saved state.
- **Defaults.** The field group's defaults come from the §5 calibration row: divisors field 6, dust map 5, extras 1,
  shells 1, young 2, DIG 4, as the tool has them today.

## 7. The Layer

`selectMilkyWayParts(settings) → { cloud: boolean; cloudDust: boolean; field: boolean }` is the only code that reads
`renderer`:

| `renderer` | `cloud`   | `cloudDust`  | `field` |
| ---------- | --------- | ------------ | ------- |
| `'v1'`     | true      | true         | false   |
| `'v2'`     | false     | false        | true    |
| `'both'`   | true      | false        | true    |

Each of these lands as a plain addition:

- **Targets.**
  - One `RenderTargetSpec` row per `FieldTargetId` (ids `mw-field-*`). Each has `scale: (s) => s.settings.milkyWay.field.divisors[id]`
    and `allocateWhen` = the `field` part. The formats are HDR, except the dust map, which uses `DUST_MAP_FORMAT`.
  - `mw-aggregate` gains `allocateWhen` = the `cloud` part.
- **Lifecycle.** The runtime holds the host lazily.
  - `milkyWayPlanner`, which is once-scope and runs before any encoder, creates the host (through a slot that only
    creates and destroys) when the `field` part turns on and destroys it when the part turns off. While the host
    exists, the planner calls `setTuning` with the current tuning on every frame (the host's identity keys skip
    unchanged sections), then `ensureFresh()`, then `plan()`, and returns `{ host, plan }` as its value.
  - With `renderer: 'v1'`, nothing is baked at startup.
  - The Layer's `destroy` also destroys the host.
- **The compute.** A `mw-field` `ContentCompute` with `scope: 'perView'` and `fade: 'milkyWayDisk'` sits on the SCENE
  section's compute line, beside `aerial-perspective` in `frameSections.ts`.
  - It reads `{ host, plan }` from the planner's value and encodes
    `host.encode(plan, deriveFieldView(ctx, toGalaxy), targets, claim)`.
  - It builds `targets` from `renderTargets.viewOf`/`sizeOf`.
  - It declines when the planner value is null, the alpha is 0, or its DebugPanel toggle is off.
- **Alpha.** The app's visibility alpha (`deriveMilkyWayCloudAlpha`: fade × emphasis × focus-recede) multiplies the
  field's exposure, the same way the tool folds its fade into `analyticExposure`. Exposure is applied after the ISM, so
  the alpha never reaches the ISM chain or its normalization.
- **The composite.** One `milky-way-field` `ContentPass` on the hdr NEAR0 line, right after `milky-way-upsample`. It
  loops over the planner value's `plan.composites` with the Layer's additive upsample. It's one hand-written pass rather
  than five upsample rows, because the source set varies by frame. It shares the compute's gate, including the toggle:
  `executeFrame` skips a compute whose `settings.debug.disabledPasses` entry is on, and the composite must skip with it
  or it would add the previous frame's targets.
- **v1 gates.**
  - `milky-way-aggregate` and `milky-way-upsample` gate on the `cloud` part.
  - `milky-way` draws its dust on the `cloudDust` part.
  - The pick impostor always draws, so the disc stays clickable in every mode.
- **Timing.** The compute claims one timestamp slot, `mw-field-compute`, through `ClaimTimestampWrites`. The renderer asks
  for timestamps by `FieldTargetId`, and a span adapter gives the first encoded pass the begin index and the last the
  end index, so the slot brackets the whole field.
- **DebugPanel.** The tuning section shows a renderer select, then the cloud rows when `cloud` is on and the field
  rows when `field` is on. Follow `ui-ux.md`.

## 8. Testing and verification

These are the tests that can fail on a real bug no other check catches (`testing.md`):

- **`selectMilkyWayParts`.** It matches the table in §7 for all three values.
- **`deriveFieldView`.**
  - With the identity it returns the world eye, basis and frustum unchanged.
  - With a rotation plus uniform scale it returns the galaxy-frame eye that `milkyWayCamPosModel` gives, and the
    frustum is unchanged.
- **Field header byte layout.** The four tangents and the relocated `exposure` sit at the lanes in the plan's table, and
  `io.wesl` declares them there (TS↔WGSL contract).
- **`FieldFramePlan`.** `composites` is the subset of `encodes` in the upsampled set, and a tier with no components is
  in neither.
- **Settings reducers.** Each setter merges only into its own group, and a sprite patch never changes `field` or
  `renderer`.
- **Slider rows.** The parity test is updated per group.

Visual and performance checks:

- **PR A: tool identity.** Before and after screenshots in the tool at two presets, an outside view and an in-disc view,
  must be pixel-identical. Prep 1–3 change no maths for the identity placement.
- **PR B: first light.** Shots of the Milky Way pose and an in-disc pose in each of `'v1'`, `'v2'` and `'both'`, plus one
  shot with a lens shift so the asymmetric frustum is exercised. The user gives the verdict.
- **PR B: cost.** Run `npm run perf` with `renderer: 'v1'` before and after the change. The two must match, because the
  default costs nothing. The field's own cost is read from the `mw-field-compute` slot with `?gpuTimings`, and it is
  recorded, not gated: v2 is debug-only.

## 9. Ground preparation

The refactor-ground checkpoint was re-run on 2026-11-09 and signed off on 2026-11-10. Four of the eleven touchpoints
would have been special cases on today's ground. Each of these prep commits creates the joint one of them needs, and
lands before the feature:

| #   | Prep commit                                                                         | The special case it removes                                                                                       | PR  |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --- |
| 0   | The v2 engine moves into `src/layers/milkyWay/field/` (approved module map); dead ISM samplers deleted first | 13k lines of single-Layer code sitting in core (Layer leftovers audit, row S1)                       | 0   |
| 0b  | The 11 multi-function v2 builders split to one function per file                    | ADR 0014's one-function-per-file `utils/` rule, which the move puts them under                                     | A   |
| 1   | The field camera is a `FieldView` (§3)                                              | The symmetric fov, and the galaxy frame treated as the world (`packFieldUniforms.ts:154`, `camera.wesl:163`, `splatSilhouette.wesl:47`) | A   |
| 2   | Field targets are `{ view, sizePx }` (§4)                                           | Raw `GPUTexture`s and caches keyed on texture identity (`createGalaxyFieldRenderer.ts:388`, `createFieldPipelines.ts:55`)    | A   |
| 3   | The host moves into `src/`, with one `FieldFramePlan` (§5)                          | A host that lives only in the tool, and two segment lookups (`createGalaxyEngine.ts:515`)                         | A   |
| 4   | The v1 knobs move under `settings.milkyWay.cloud` (§6)                              | A flat bag in which a field `exposure` would collide with v1's                                                    | B   |

The seven remaining touchpoints are growth inside the Layer (§7), in `field/computes/`, `field/passes/`,
`field/render/` (the target rows), `field/utils/deriveFieldView.ts`, `state/` (the parts selector), `tuning/` and
`frame.ts`. They are: the parts selector, the target rows, the planner
lifecycle, the compute, the composite pass, the v1 gates, and the DebugPanel rows. The frame order gains two names.

The greenfield cross-check agreed with the sketch on everything except the settings shape, which the checkpoint ruled
nested. One idea from the brief was rejected: folding the field camera into `CameraUniforms`, for the reason given in §3.

## 10. Packaging and docs

- **PR 0 (the move).** Done with `npm run move-files -- --manifest`, using the module map's manifest. It is a move
  only, apart from a first commit that deletes the dead ISM samplers (those the galaxy tool doesn't use), and it merges
  first.
- **PR A (prep 0b, 1–3).** Tool-verifiable on its own; the app is untouched. Its first commit adds this spec and its
  plan, and deletes the brief's backlog line and detail file.
- **PR B (prep 4, then the feature).** Opened after PR A merges, from a branch that merges main in.
- **Docs that ride PR B:**
  - the v2 README line "Only the tool drives this tier";
  - `docs/research/engine/field-seam-map.md` §2, which cites files that no longer exist;
  - Track C's status in `docs/research/engine/decisions.md`;
  - an entry in `docs/RENDERER.md`'s renderer map.

## 11. Risks and open questions

- **The header relayout is a TS↔WGSL contract.** A mismatch shows as a blank or skewed field, not as an error. This is
  why the byte-layout test and the tool identity pair are gates for PR A.
- **Compute-written targets are invisible to `touched` and `checkFrameOrder`** (`executeFrame.ts:215-237`). The
  composite stays correct only because it reads the same plan the compute encoded, and only while the compute ran.
  The first is enforced by one planner value rather than a comment, and the second by a shared gate that also checks
  the compute's DebugPanel toggle. The frame checks still can't see it. The deeper fix, letting a `ContentCompute`
  declare the targets it writes so `touched` sees them, grows the frame contract and is deferred.
- **Construction cost on toggle.** Switching to v2 re-bakes the noise volumes every time. That's acceptable for a debug
  switch, and no release delay is added up front.
- **App-resolution cost is unmeasured.** The tool's field pass costs 2.5–3 ms at divisor 6, at the tool's resolution.
  The phone is already at about 40 ms p95 at the Milky Way pose
  (`docs/backlog/2026-10-12-kpc-view-galaxy-and-milky-way-cost.md`). Since v2 is off by default, this informs the later
  default decision and gates nothing here.
