# Depth-aware atmosphere composite: design

> **Status.** Ground preparation signed off 2026-09-18; ready to plan.
> **Date.** 2026-09-18.
> **Supersedes.**
> [Froxel aerial perspective](2026-09-14-atmosphere-froxel-aerial-perspective-design.md)
> and its plan. That design's §1 diagnoses the same missing scene depth; its PR
> (#709) was closed 2026-09-15 when 32 distance slices could not resolve
> planetary-scale fog. This design reaches the same goals without a froxel volume,
> because the shell needs one number per pixel (where the ray stops), not a volume.
> **Absorbs.** `docs/backlog/2026-09-17-terrain-f3b-remaining-routing.md` item 2
> ("Terrain under an atmosphere — blocked"), and the atmosphere row of the terrain
> spec's §8.3 table, which already reads *"correct only once the composite is
> depth-aware"*.

## 1. Problem

Three symptoms, one cause: **nothing in the frame knows where the rasterised
surface actually is.** Both consumers stand in an analytic sphere for it, and
Mars's F4 terrain is the first body where that sphere is badly wrong.

`atmosphereParams.ts:33` sizes the shell's ground sphere from
`innerBoundRadiusM`. For Mars that is 3,387.989 km, while the datum sits 6.19 km
*below* the areoid, so ordinary Mars ground is at ~3,396.19 km:

| | radius | above the shell's ground sphere |
| --- | --- | --- |
| shell ground (inner bound, Hellas floor) | 3,387.989 km | — |
| datum | 3,390.000 km | 2.01 km |
| areoid 0 — typical ground | 3,396.190 km | **8.20 km** |
| outer bound (Olympus) | 3,417.431 km | **29.44 km** |

against a 60 km thick shell.

### 1a. The unhazed band (the reported bug)

`shell/fragment.wesl:171` terminates every ray on that sphere, and `:277` splits
duty by triangle facing: front faces render ground-hitting rays, back faces render
the rest. A ray onto terrain that misses the inner-bound sphere therefore falls off
**both** walls — the front wall discards it (`intersectsGround` false), and the
back wall, which would take it, is depth-rejected behind the terrain
(`atmosphereShellRenderer.ts:322`, `'nearer-or-equal'`). Neither the multiply nor
the add pass runs: raw tile albedo.

Haze survives only where `sin(incidence) < bottomRadius / r_terrain`:

| terrain | haze cuts out beyond |
| --- | --- |
| datum | 88.03° |
| areoid 0 | 86.02° |
| Tharsis (+10 km) | 84.07° |
| Olympus | 82.47° |

so the artifact is a hard-edged strip at grazing incidence — at the limb from
orbit, along the horizon from low altitude. The strip immediately *inside* it is
wrong the other way: a ray with impact parameter just under 3,387.99 km crosses
real areoid-0 ground **236 km before** it reaches the analytic sphere, so `tFar`
integrates a couple of hundred km of air that is not there. Across the horizon the
sequence reads over-hazed → hard edge → unhazed → hard edge → limb glow.

The base globe is drawn at `innerBoundRadiusM` too (`earthPass.ts:153`), which is
why it stays consistent and only the *tiles* misbehave.

### 1b. Orbit trails through mountains

`sceneOccluderBodies.ts:44,50` sizes every occluder at `innerBoundRadiusM`, and
`orbitTrail/fragment.wesl:36` hides a trail by testing the eye→orbit-point segment
against those spheres. Every Martian mountain is above that sphere and therefore
invisible to the test. The module header states the bias deliberately — *"an
occluder must under-occlude"* — which was right against a smooth sphere and is
wrong against displaced tiles.

### 1c. The inside-path washout and the #698 stopgap

Inside the shell the pass is full-screen with `depthCompare: 'always'`, so a
down-looking ray gets the whole camera-to-space column. The same missing depth is
why `frameOrder.ts:226` draws `mesh-bodies` *after* the shell: correct silhouettes,
at the price of a rover taking no aerial perspective at all.

## 2. Ratified decisions

- **Scope: all three.** One mechanism fixes them; splitting would ship the seam
  three times.
- **Packaging: one PR**, prep as its own commits ahead of the feature commits.
- **The shell's analytic ground sphere is deleted as a ray-termination target.**
  `bottomRadius` survives as a *scalar*: the sky-view LUT's above/below-horizon
  selector (`scattering.wesl:424-451`) must keep matching the bake. Radii that
  parameterise the medium stay; radii that stand in for geometry go.
- **Absence is arithmetic, not control flow.** A 1×1 depth texture cleared to
  `depthClearValueFor(true) === 0` decodes to `+∞`, which is `min()`'s identity.
  "No depth bound", "nothing drew" and "empty texel" become one number through one
  instruction stream — so the probe-capture path needs no second pipeline, no
  shader define, and `CaptureStepSpec` needs no depth knob.
- **Trails keep their sphere array.** Depth covers the nearest chain row only
  (every row clears its own); the spheres remain the sole source for every other
  row. Depth multiplies in as an additional clearance factor rather than replacing
  them — one redundant test in a 16-iteration loop, against a bookkeeping error
  that would silently un-occlude the largest body on screen.

## 3. Ground preparation

Produced by `refactor-ground`, 2026-09-18, with an adversarial greenfield
cross-check. Verdicts against the ideal diff:

| Joint | Verdict | Blocker |
| --- | --- | --- |
| Scene depth as a bindable resource | **bolt-on** | `lib/sceneDepth.wesl:14` is named for depth but reads colour *alpha*; a real depth helper beside it is a trap |
| A second step per body row | **bolt-on** | `expandFrameOrder.ts:102` hard-codes `depth: 'clear'`; `ForegroundStepSpec` has no depth field |
| A per-frame texture group on the shell | **bolt-on** | the shell bind group is cached per body (`atmosphereShellRenderer.ts:93`) and rebuilt only on LUT resize, but a render-target view is recreated on every `reconcile()`. Group 1 is free |
| Trails renderer taking a view | **growth** | an optional trailing `GPUTextureView` is already the house idiom (`SelectionRingRenderer.d.ts:41`) |

**Prep (own commits, sequenced first):**

1. Rename `lib/sceneDepth.wesl` → `lib/sceneCoverage.wesl` (4 consumer shaders).
   It reads colour alpha; the name is needed for the real thing.
2. `sceneDepthGroup.ts` + a 1×1 dummy depth texture owned by `renderTargets`.
3. `ForegroundStepSpec` grows a third roster (§4.2).

**Cross-check divergences resolved.** The greenfield derivation wanted (a) a
`DrawGroupSpec`/`compileFrame` rework of the whole frame vocabulary, rejected —
`expandFrameOrder` is already a pure, testable compiler and its `depth` field is
already one discriminant rather than three booleans, so the illegal-state trap it
warns about is already avoided; (b) the analytic sphere deleted outright, defended
in §2 by the LUT bake; (c) `uvScaleBias` for fragCoord→depth mapping, dropped —
`hdr` and `foreground:0` are both `scale: 1` (`renderTargets.ts:201,244`), an
invariant `sceneCoverage.wesl` already relies on. Its two shapes that **did**
reshape this design are the `+∞` absence identity and killing the facing split.

**Adjacent findings — backlog, not this diff.** `renderTargets.ts:111-113` says
the depth texture carries "ONLY `RENDER_ATTACHMENT`" while `:417` grants
`TEXTURE_BINDING`; `executeFrame.ts:319` marks a `'sample'` step touched
unconditionally while `:155` warns against it with nothing enforcing it.

## 4. Design

### 4.1 The seam

```
src/@types/rendering/SceneDepthSource.d.ts
  view: GPUTextureView   // foreground:0 depth, or the 1x1 dummy
  nearM: number          // the PRODUCING row's near; viewZ = nearM / depth

src/services/gpu/renderers/shared/sceneDepthGroup.ts
  SCENE_DEPTH_GROUP_INDEX = 1
  SCENE_DEPTH_LAYOUT_DESC          // texture: { sampleType: 'depth' }
  createSceneDepthBindGroup(...)   // rebuilt per frame, like occlusionCoverageGroup
```

Body rows are reversed-Z with `far: Infinity` (`slabs.ts:201-203`), so
`viewZ = nearM / depth` is exact; no matrix travels. All slabs share the camera's
view basis, so a consumer on a different slab compares in view space directly.

`textureLoad`, never a sampler: depth is not filterable across a silhouette.

### 4.2 The frame step

`ForegroundStepSpec` grows `sampleDepthPasses`, expanding to a **second step per
body row** with `depth: 'sample'`, immediately after that row's opaque step. One
authored line, two steps per row, because the pairing is an invariant — the
sampling step must see the depth its own row just wrote, before the next row
clears it.

`atmosphere-shell` moves into that roster. `rings` and `cloud-shell` stay in
`bodyPasses` (they want the hardware depth test). **`mesh-bodies` moves back into
`bodyPasses`, ahead of the shells** — that is the #698 stopgap retiring: a rover's
depth is now what the shell stops on, so it gains aerial perspective instead of
being drawn over.

`sameGroup` already keys on `depth` (`expandFrameOrder.ts:130`), so the new step
will not fold into its neighbours; it costs one pass boundary per body row.

### 4.3 The shell fragment

`tFar = min(topExit, sceneRayT(...))`, and that is the whole fix. What it deletes:

- the ground-sphere ray termination;
- the `front_facing` wall-duty split and the `sampleShell`/`sampleShellRay` pair
  that exists to host it — from outside, the front hemisphere already covers every
  ray that meets the shell, so the split was only ever disambiguating rays that had
  no scene depth;
- `cullMode: 'none'` becomes a CPU decision per body per frame
  (`eyeToCentre > rTop ? 'back' : 'front'`), so each pixel is covered once.

Cross-body occlusion moves from the hardware depth test to `tScene`, which is
strictly better: an attached mesh riding the host's row now occludes the shell
correctly rather than being over-drawn.

### 4.4 The trails

`clear *= depthClearance(x)` beside the existing sphere loop.
`OcclusionUniforms` grows one `vec4<f32>` appended **after** the fixed-size array
(byte 272): `camForward.xyz` + `nearKm` in `.w`. That placement disturbs neither
`OCCLUDER_COUNT_OFFSET` nor `OCCLUDER_SPHERES_OFFSET`, and the parity test's field
regex already accepts `vec4<f32>`.

The trails pass already takes `ctx` and runs after the `foreground:0 → hdr`
composite, so the depth texture is unattached and no pass split is needed.

Occlusion ramps with `smoothstep` over a few metres of depth difference: additive
conics alias badly on a binary test.

## 5. Success criteria

- No hard-edged unhazed strip at the Mars horizon from any altitude or incidence.
- A rover mesh takes aerial perspective and is not drawn over by the shell.
- An orbit trail passing behind a Martian mountain is hidden by it.
- Earth's limb, sunset arc and over-disc haze are unchanged to the eye.
- `npm run perf` shows no regression beyond the added pass boundary per body row.

## 6. Out of scope

- Raising Mars's shell onto the areoid (`docs/backlog/2026-09-17-mars-terrain-followups.md`).
  Once termination is depth-driven, the ground sphere's radius stops mattering for
  anything but the LUT split, so that bullet resolves to "fix the stale comment".
- Terrain self-shadowing, vertical exaggeration, cloud-deck-as-altitude.
- Per-constituent Bruneton tables (the parked successor brainstorm).

## 7. Correction pending before the plan is written

§4.1/§4.3 imply both consumers decode depth the same way (`viewZ = nearM / depth`).
The shell does not need that: it already carries `invMvp`, and unprojecting
`(ndc.xy, depth)` through it lands directly in the shell's own local frame, so
`tScene = length(p - camPosLocal)` needs **no new uniform field and no change to
`AtmosphereUniforms` or its parity test**. Screen size comes from
`textureDimensions`, not a uniform. Only the trails need the `vec4` of §4.4,
because their frame (NEAR0, km) differs from the frame that wrote the depth.

So `lib/sceneRayDepth.wesl` exposes the shared part only — the `textureLoad` and
the "raw 0 means nothing here, so +∞" identity — and each consumer decodes in its
own frame. Fold this into §4 when the plan is written.
