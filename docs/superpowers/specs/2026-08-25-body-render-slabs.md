# Body render slabs — design

> **Status.** Drafted 2026-08-25, Fable-reviewed; §11's questions ruled same day
> (see each entry); awaiting user approval of the spec as a whole. Not yet built.
> **Date.** 2026-08-25.
> **Ruling record.** [`docs/grill-sessions/globe-camera-pivot-2026-08-24.md`](../../grill-sessions/globe-camera-pivot-2026-08-24.md).
> Every decision below is cited to it (`ruled, S5`) rather than re-argued. Where
> this spec adds something the transcript did not settle, it says so in §11.
> **Spec 1 of two.** Spec 2 (the globe-anchored camera pivot) lands after this
> one and swaps provider B in behind §5's seam without touching the renderer
> (ruled, Q1b).

## 1. What we're building

Every rendered body gets its own **slab**: a render pass in that body's own
body-fixed frame, in SI metres, with the projection built about the eye. The
`Slab` type gains a frame discriminant — `world-mpc` (today's NEAR0/COSMO) or
`body-m` — and the discriminant doubles as the unit declaration (ruled, S3;
greenfield cross-check CONVERGED). Body slab rows are derived per frame, one per
visible body, dynamic count, nothing persistent (ruled, S5).

All planets and moons ride body slabs in this landing; the incumbent
Mpc-frame body-sphere composition path (`composeBodyMvp` for bodies) is
**deleted**, not paralleled — Earth-only-first would leave two live
planet-rendering paths, the parallel-path smell the design exists to kill
(ruled, S4). Sun and stars stay in NEAR0.

### Why now

Three things converge on the same change.

**The camera pivot needs it.** Spec 2's authoritative surface state is a
body-fixed metre pose. If the renderer still consumes world-Mpc, the pivot has
to convert back out at every draw site — precision-relativity that stops at the
camera and does not reach the renderer is exactly the failure X §4 names in
OpenSpace. Landing the slab first means spec 2 changes the _source_ of a pose
the renderer already consumes, and nothing else (ruled, Q1b, S1).

**The precision floor is a unit choice, not a technique.** The black-nadir
denormal disc (WESL landmines) is arithmetic on a Mpc-magnitude radius: Earth's
radius is ≈2.06e-21 Mpc, and a shader that squares it produces ≈4.3e-42 —
inside f32's denormal range (smallest normal 1.18e-38), flushed to zero, disc
goes black. The same square in metres is 4.06e13. The bug class stops being
something to defend against and becomes unrepresentable.

**The tile planner's frame is where the false-negative-cull family lived.**
`prepareEarthFrame` + `cutSurfaceTiles` work today from the world-Mpc camera
through an ad-hoc rebase into body-radii units; the z14–19 tile-vanish was a
planner false-negative cull in that frame. Slab-native planning re-opens the
parked descent-island issue in a frame where its suspects are no longer
confounded by precision (ruled, S7).

### Goals

- One body-rendering path. A body's geometry is expressed in that body's frame,
  in metres, at every distance — no activation threshold, no handoff, no
  crossfade (ruled, S5).
- Atmosphere, base globe, clouds, rings, glint written once and
  body-parameterized; constants come from the body registry row (ruled, S4).
- The Mpc↔metre conversion happens at exactly one seam, grep-testable
  (ruled, S3).
- Visual parity with `main` at every representative view; perf neutral-or-better.

### Non-goals

- **The camera regime and surface state** (spec 2): `SurfaceCameraState`, the
  `h/R` regime boolean, re-anchoring, gestures. This spec consumes provider A
  only — the body-relative pose derived from the incumbent heliocentric camera,
  ~14 µm floor, ample for rendering (ruled, S1, Q1b).
- **Keyframe/serialization frame tags** (`PoseFrame`, Q10/Q10b) — spec 2.
- **Cross-fade of any kind** — ruled out (S5). No blend between representations.
- **Inertia/coast** (ruled, Q8: none) and **XR** (no XR path on main).
- **Sun and stars moving to body slabs.** The Sun keeps its NEAR0 sphere and its
  bloom path (ruled, S4).

## 2. Ground preparation

Refactor-ground ran over this shape on 2026-08-24 (ideal diff, joint verdicts
J1–J8, prep list P1–P4). Four missing joints are prep; the rest is growth.

**Packaging: P1–P4 land as a separate PR off `main`, before this spec's feature
commits** (user ruling at the refactor-ground checkpoint). Each is its own diff
inside that PR, with no behaviour change; the feature branch then rebases onto
the post-prep architecture, which is what §3 onward is written against.

**P1 — `SlabFrame` on `Slab`.** Today `originRelative: boolean` is the only
frame hint (`Slab.d.ts:30-45`). Introduce the discriminated union; existing rows
become `{ kind: 'world-mpc', originRelative }`; `slabViewOf` and every layer that
reads `originRelative` read through it. Adding `body-m` as another boolean or a
special case would be a bolt-on — the union is the joint (J1).

**P2 — `frameProgram`: static array → builder.** `frameProgram.ts:87-166`
returns a hand-written step list. Per-body passes need a builder that expands
body steps and orders them; without it, body passes would be hand-appended
entries (J2). The builder emits today's exact list initially, and the `FrameStep`
type gains the slab-expansion and ordering hooks §6/§7 use.

**P3 — `executeFrame`: step-level depth load-op.** `executeFrame.ts:132-151`
derives the depth load-op from first-touch-of-a-target-this-frame. Body slabs
share `foreground:0` and need clear-at-slab-boundary. The step gains an explicit
depth load-op whose default reproduces today's first-touch rule exactly (J3).

**P4 — units.** `SCALE_UNITS` grows `M_TO_MPC` / `MPC_TO_M`
(`scaleUnits.ts:27-65` has no metre row today), and the scene body registry's
authored radii migrate from `radiusKm` to `radiusM` (ruled; tension T1 resolved
toward the greenfield SI form). Pure rename-and-×1000, no behaviour change.
**Size, measured:** `radiusKm` appears 249 times across 88 files including
tests; the runtime body-registry family is `BodySpec` / `PlanetBody` /
`EarthBody` / `StarBody` / `AnchorPointBody` plus their makers, `scenePlanets`,
`sceneEarth`, and every reader (`bodyApparentDiameterPx`, `atmosphereParams`,
`selectionHaloTable`, `focusFraming`, `bodyLikeFraming`, the clips, the UI
detail card). See §11-O1 for the one boundary this spec does not settle.

## 3. Data delta

The binding shapes, carried verbatim from the refactor-ground sketch.

```ts
// src/@types/engine/frame/SlabFrame.d.ts
/** Which frame — and therefore which units — a slab's `vp` and geometry are in. */
export type SlabFrame =
  | { readonly kind: 'world-mpc'; readonly originRelative: boolean }
  | { readonly kind: 'body-m'; readonly bodyId: BodyId };
```

The `kind` is the unit declaration: `world-mpc` ⇒ Mpc, `body-m` ⇒ SI metres in
that body's body-fixed axes, projection built about the eye. There is no
separate unit field — a second field could disagree with the first (ruled, S3;
greenfield cross-check CONVERGED).

```ts
// src/@types/engine/frame/Slab.d.ts  (reshaped)
export type Slab = {
  readonly index: number;
  /** Near plane, in THIS slab's units (see `frame.kind`). */
  readonly near: number;
  /** Far plane, in THIS slab's units. Ignored under infinite-far reversed-Z. */
  readonly far: number;
  /** proj·view. For `body-m`, built about the eye — RTC-native, no rebase step. */
  readonly vp: Float64Array;
  readonly frame: SlabFrame;
  /**
   * Camera-distance interval, in METRES, spanned by the depth-bearing content
   * this row contributes. Metres for EVERY row (including `world-mpc` ones) so
   * the painter sort compares across frames without a per-row unit branch.
   */
  readonly distanceRangeM: readonly [number, number];
  readonly precision: 'f32' | 'f64';
  readonly reversedZ: boolean;
};
```

`nearMpc`/`farMpc` are renamed to `near`/`far`: the unit no longer lives in the
field name, because it varies by row and `frame.kind` already carries it. Leaving
the `Mpc` suffix on a field that holds metres is the class of lie the comments
convention exists to prevent.

```ts
// src/@types/engine/frame/ContentLayer.d.ts  (delta)
export type ContentLayer = {
  // …
  /**
   * Slab index, or `'body'` — expanded by the frame program into one step per
   * body-slab row. A `'body'` layer reads `view.slab.frame.bodyId` to know
   * which body it is drawing.
   */
  readonly slab: number | 'body';
  /** Now takes the resolved view: a `'body'` layer gates per body row. */
  enabled(state: EngineState, ctx: ReadyFrameContext, view: SlabView): boolean;
  // …
};
```

```ts
// src/@types/engine/camera/BodyRelativePose.d.ts
export type BodyRelativePose = {
  /** Eye − body centre, expressed in the body's FIXED axes, in metres, f64. */
  readonly eyeRelBodyM: Vec3;
  /** Camera right | up | forward as columns, in the body's fixed axes. */
  readonly basisM: Mat3;
};

// src/@types/engine/camera/BodyPoseProvider.d.ts
/** The seam §5 defines. Null ⇒ this body has no pose this frame (culled). */
export type BodyPoseProvider = (bodyId: BodyId) => BodyRelativePose | null;
```

```ts
// src/@types/scene/BodyState.d.ts  (delta)
export type BodyState = {
  readonly positionMpc: Vec3;
  readonly orientation: Mat3;
  readonly meanAnomalyRad: number;
  /** Equatorial radius in metres, resolved once here from the registry row. */
  readonly radiusM: number;
};
```

## 4. Per-frame derivation

`deriveSlabs` stays the sole per-frame builder and the sole call site
(`frameContext.ts:178`). Its signature grows the inputs a body row needs:

```ts
// src/services/engine/frame/slabs.ts
export function deriveSlabs(input: {
  readonly cam: OrbitCamera;
  readonly cosmoVp: Mat4;
  readonly pivotRadiusMpc: number | null;
  /** This frame's ONE `R_body(t)` sample — see the shared-sample rule below. */
  readonly bodyStates: ReadonlyMap<BodyId, BodyState>;
  readonly pose: BodyPoseProvider;
  readonly visibleBodies: readonly SceneBody[];
  readonly viewportPx: Readonly<Vec2>;
}): readonly Slab[];
```

It returns `[near0, cosmo, ...bodyRows]`, body rows sorted **back-to-front by
`distanceRangeM[0]` descending** (§7). Index-keyed lookup (`slabViewOf`) still
holds because `Slab.index` is the array position `deriveSlabs` assigns.

**Which bodies get a row.** Every body that survives visibility culling — the
existing `SUB_PIXEL_BODY_CULL_PX = 1` apparent-diameter floor
(`subPixelBodyCullPx.ts`) plus frustum rejection. A visible body always renders
through its slab at every distance; there is no activation threshold and a
sub-pixel body is simply a very small slab draw (ruled, S5). Pass count is
bounded by the registry: 1 Earth + 25 `SCENE_PLANETS` rows, of which only a
handful are ever simultaneously above the cull floor.

**Each row's numbers.** For a body at eye-distance `dM` (metres) with outermost
drawn shell radius `rMaxM`:

```
distanceRangeM = [max(dM − rMaxM, 0), dM + rMaxM]
near           = max(dM − rMaxM, MIN_NEAR_M)
far            = +∞   (infinite-far reversed-Z, as NEAR0 already uses)
```

`rMaxM` is `max(radiusM, atmosphereTopM, cloudShellM, ringOuterM)` for the rows
the registry declares — one helper, `bodyDrawRadiusM(body)`, so the near plane
and the painter interval cannot disagree about how big the body's drawn footprint
is. The bracket is **derived, not tuned**: unlike `foregroundFrustum`'s
altitude-keyed heuristic, a body slab knows exactly what it contains.

`MIN_NEAR_M` exists only to keep `near > 0`. It is not a denormal dodge —
`MIN_NEAR_MPC = 2e-22` was, and that constraint dies with the unit change (§1).

**One `R_body(t)` sample per frame.** `orientationForBody` already has exactly
one evaluation site (`deriveBodyStates`, memoized per `simDays`). The pose
provider, the slab rows, and every body layer read that same snapshot via
`sceneBodyStates(state, ctx)`. Two samples at different `t` is a sub-frame ground
slide (DESIGN-INPUT §3.5 item 4); the single-snapshot rule is what makes it
unrepresentable, and spec 2 depends on it.

## 5. The pose provider seam

```ts
// src/services/engine/camera/bodyRelativePose.ts   (provider A)
export function bodyRelativePose(input: {
  readonly bodyId: BodyId;
  readonly camPosMpc: Readonly<Vec3>;
  readonly camBasisWorld: Readonly<Mat3>;
  readonly bodyState: BodyState;
}): BodyRelativePose;
```

Provider A derives the body-relative pose from the incumbent heliocentric f64
camera: subtract the body centre in f64 Mpc, scale by `MPC_TO_M`, rotate by
`orientationᵀ` (the body's local→world rotation inverted — orthonormal, so
transpose), and carry the camera basis through the same rotation. Floor ≈14 µm at
Earth-radius magnitude, ample for rendering (ruled, S1).

**Contract of the seam.** `deriveSlabs` and every consumer take a
`BodyPoseProvider`, never `bodyRelativePose` directly. In this landing the only
implementation is a closure over provider A. Spec 2 introduces provider B — the
natively body-fixed surface state, ~nm floor — as a second implementation of the
same type, selected by the regime boolean, and the renderer does not change.
Both produce the same value at the flip. A is not a stepping stone B replaces;
outside the band the camera is heliocentric regardless, so **B keeps A** (ruled,
S1).

**This is the ONE Mpc↔metre site.** `bodyRelativePose` is the only module in the
body path that multiplies or divides by `MPC_TO_M`/`M_TO_MPC`. A grep test
asserts it: no other file under the body slab path imports those two constants
(ruled, S3; DESIGN-INPUT §4).

**Two incumbent transforms become consumers.** `camPosLocal`
(`earthLayer.ts:144-149`, body-radii units) and `lonLatFocusPose`
(`src/utils/camera/lonLatFocusPose.ts`) are two independent body-local transforms
today (J5). `camPosLocal`'s job — put the camera in the frame where the body is
the unit sphere, per-axis-scaled for oblateness — becomes a pure division of
`eyeRelBodyM` by the body's per-axis metre radii, downstream of the seam.
`lonLatFocusPose` reads the same pose instead of re-deriving from Mpc.

## 6. Layer expansion

`ContentLayer.slab` becomes `number | 'body'` (ruled; tension T3 resolved toward
the sentinel — a `SlabSelector` type is more surface than the one extra variant
earns, and nothing in this landing needs a per-body _star_ or _label_ row).

The frame-program builder (P2) expands each `'body'` layer into one step per body
slab row, in painter order. The layer reads `view.slab.frame.bodyId` to resolve
which body it is drawing; its `enabled(state, ctx, view)` gate is evaluated per
row, so a layer that applies to only some bodies simply returns `false` for the
rest. `enabled` gaining the `SlabView` argument is why `executeFrame` resolves
`slabViewOf` _before_ filtering the group rather than after.

**Layers that become `slab: 'body'`:**

| layer                  | body-parameterized by                                                      |
| ---------------------- | -------------------------------------------------------------------------- |
| `earthLayer`           | base globe mesh + the tile draw; tiles gated on a tile-source registry row |
| `atmosphereShellLayer` | `ATMOSPHERE_PARAMS` row (already body-generic today)                       |
| `cloudShellLayer`      | cloud-shell ratio on the registry row                                      |
| `planetsLayer`         | the partition's `flat` branch, filtered to this row's body                 |
| `texturedBodiesLayer`  | the `textured` branch, filtered to this row's body                         |
| `ringsLayer`           | `RingSpec` on the registry row                                             |

Earth is simply the only body whose registry row carries a tile source (ruled,
S4). Nothing about the tile pipeline is Earth-typed after this; it is
body-parameterized and Earth is the only row that fills the parameter.

**The sphere↔dot partition survives, inside the one path.**
`partitionBodiesByPresentation` (`BODY_GLINT_MAX_PX = 3`) still decides
glint / flat / textured — it is a _presentation_ choice, and the ruling keeps it
as one (S5). What it no longer decides is which code path a body takes.

**`bodyGlintsLayer` stays `slab: NEAR0`, `target: 'hdr'`** — see §11-O2 for why
this deviates from the brief's layer list, and what would change it.

**Timing slots.** `SLAB_NAME`/`groupKeyOf` gain a body form —
`'foreground:0·BODY[i]'` for the i-th body row in painter order. `TIMED_SLOTS` is
a module constant allocated once, so the pool size is the **scene body registry's
row count**, derived from the registry rather than authored: a visible-body count
can never exceed it. Unused slots read zero and their rows drop from the
DebugPanel's grouped list, exactly as an empty group does today. All body slots
share the existing `'Foreground bodies · depth'` group title.

## 7. Compositing

**The rule (ruled, S6).** Bodies and the Sun never interpenetrate, so per-pixel
cross-slab depth solves a problem that cannot occur. Each depth-bearing pass
declares its camera-distance interval; passes composite back-to-front into the
shared colour target; depth is cleared at each slab boundary (P3's step-level
load-op). Option B — shared depth via re-projection — is the precision minefield
the slabs exist to escape.

**What is actually in the chain.** Grep of the layer registry: `foreground:0` is
the only depth-bearing target, and exactly eight layers write it — `earth`,
`atmosphereShell`, `cloudShell`, `planets`, `texturedBodies`, `rings`,
`starSpheres`, `fieldStarSphere`. Everything else is `hdr` (depthless, additive,
composited before the foreground) or `swap` (overlays, after the tone-map). Six
of the eight become `slab: 'body'`; the two that remain are star spheres.

So the painter chain is: **one NEAR0 star-sphere row, plus one row per visible
body, sorted back-to-front.** Nothing in it spans a wide distance range — orbit
trails, constellations, the Milky Way impostor and the star catalog are all
depthless HDR content and never enter the sort.

### 7.1 The Sun-vs-body ordering problem (J4), solved

The Sun sphere lives in `starSpheresLayer` on NEAR0 and can sit nearer than a
resolved body (Jupiter behind the Sun) or farther (Earth in front of the Sun).
The refactor-ground pass left this open; the answer is that **frame kind and
painter position are independent axes.** A `world-mpc` row carries a
`distanceRangeM` exactly as a `body-m` row does, so the NEAR0 star-sphere row
sorts among the body rows by distance with no special case, and the Sun keeps its
Mpc frame and its bloom path (ruled, S4) at zero cost to ordering.

The NEAR0 row's `distanceRangeM` is derived from the resolved star spheres it
will actually draw this frame (`partitionStarsByResolution`'s output plus
`fieldStarSphereLayer`'s hysteresis gate), not from `foregroundFrustum`'s
bracket. In practice that set has one member: the Sun resolves only inside the
solar system, where the nearest field star is parsecs away and far below the
4 px `fieldStarSphere` gate; the field-star sphere resolves only on approach to
that star, where the Sun is itself sub-pixel and demoted to a point. The
derivation does not _assume_ that — it computes the range from the drawn set, so
if the set ever spans two stars the range widens and the assertion below reports
it. Escalation path if it ever fires: one `world-mpc` row per resolved star
sphere, same mechanism, no new concept.

### 7.2 The disjointness invariant, stated correctly

S6's assertion — "fires if intervals ever overlap" — is right about the intent
and too strong as literally written: two bodies side-by-side at the same
eye-distance have overlapping intervals and always will. Jupiter and Io are the
standing counterexample: `r_J + r_Io ≈ 71,700 km` against Io's 421,700 km orbit,
so at quadrature their intervals overlap every frame while at transit they are
cleanly separated.

The essential invariant — confirmed by the user 2026-08-25 as the correct
reading of S6's intent — is:

> For any pair of chain rows whose **screen-space bounding circles overlap**,
> their `distanceRangeM` intervals must be disjoint.

Two rows that overlap on screen lie along nearly the same ray, so their
eye-distance difference approaches their centre separation, which exceeds
`r₁ + r₂` for non-interpenetrating bodies. Rows that do not overlap on screen
cannot paint over each other, so their order is irrelevant. The check is O(N²)
over ≤27 rows using the apparent radius `bodyApparentDiameterPx` already
computes — a dev/test assertion, not a production cost. Overlap is a painter
ordering error, never a crash.

### 7.3 Depth, and what happens to caption occlusion

Each chain row clears depth and loads colour. Within a row, depth resolves the
body's own self-occlusion (globe vs tiles vs atmosphere shell vs rings) exactly
as the merged NEAR0 pass does today. Across rows, painter order resolves it.

That breaks the current caption/overlay occlusion, which samples the _shared_
`foreground:0` depth texture (`lib/sceneDepth.wesl`): after per-row clears the
buffer holds only the nearest row's depth, and depths from different metre-frame
projections are not comparable anyway. `sceneDepth.wesl` today carries two
flavours for exactly that reason — `occludedByScene` (a same-slab depth COMPARE,
used by the NEAR0 captions) and `coveredByScene` (a cross-slab COVERAGE test,
used by the COSMO overlays).

**Both collapse to one coverage test, sourced from `foreground:0`'s alpha.** The
target clears to `a = 0` (`renderTargets.ts`) precisely so its OVER composite
into HDR is a no-op where the foreground drew nothing; opaque body fragments
write `a = 1`. Under painter compositing that alpha accumulates across every
chain row, which is exactly the "is there a body at this pixel" signal both tests
want. This deletes the two-flavour split, the depth `TEXTURE_BINDING` usage, and
`occlusionDepthGroup`'s depth binding — a net removal.

Two details this must get right:

- **A caption over its own body.** Body captions anchor at the body centre and
  connect with a leader line, and the compare test _already_ discards the parts
  that land on the body (the body's near surface is nearer than its centre). So
  coverage is behaviourally equivalent here, not a regression.
- **Semi-transparent shells.** `atmosphereShellLayer` and `cloudShellLayer`
  depth-test but do **not** depth-write, so today they never occlude a caption.
  A naive `alpha > 0` coverage test would let a faint limb glow clip captions.
  The test is therefore `alpha > 0.5` — the opaque globe passes, the outer
  atmosphere does not. Caption clipping at Earth's limb is a named visual-parity
  check in §10.

### 7.4 Where the chain sits in the frame

Unchanged in shape: the whole chain renders into `foreground:0`, then one
`foreground:0 → hdr` OVER composite in linear space (`tone: null`), then bloom,
then the lone `hdr → swap` tone-map. Bodies still join HDR before the single tone
curve, so there is still no seam where the Sun's limb meets the cosmological
scene. What changes is that the single `{ target: 'foreground:0', slab: NEAR0 }`
step becomes N ordered steps against the same target.

**Pick follows for free.** `pickProgram` filters the same registry and groups by
slab; the body rows expand there identically. Painter order back-to-front means
the nearest row's ids overwrite the farther rows' — which is the same
front-most-wins result `frontmostPick`'s CPU fold produces across slabs today.

## 8. Tile planner goes slab-native

`prepareEarthFrame` and `cutSurfaceTiles` consume the body-local metre pose
directly; **Mpc never enters the tile pipeline** (ruled, S7).

`cutSurfaceTiles` already takes `camPosLocal` (body-radii units) and a
`viewProjLocal: Float64Array` that must stay f64 because at low altitude the
`w`-row cancels its own large terms to ~1e-21. Under a body slab both inputs
arrive already correct: `camPosLocal` is `eyeRelBodyM` (metres, from the seam),
and `viewProjLocal` is the slab's own `vp` — built about the eye in metres, so
the cancellation that forced the f64 caveat does not occur in the first place.
The f64 requirement stays as a belt-and-braces contract; the reason for it
weakens by ~20 decades.

The walk's own tests — horizon cull, frustum + projected screen extent, LOD bias
against `screenPx` — are unit-agnostic; they change from body-radii to metres and
gain the body's `radiusM` as a parameter instead of assuming a unit sphere.
`prepareEarthFrame` becomes `prepareBodySurfaceFrame(bodyId, …)`, keyed by the
slab row, and the parked descent-island known issue becomes re-checkable in a
frame where precision is no longer a confound.

## 9. Units

SI metres throughout the body slabs: state, gestures (spec 2), slab uniforms —
f64 on the CPU, narrowed to f32 only **after** the camera rebase (ruled, S3).
Because `body-m` slabs build `vp` about the eye, the rebase is structural rather
than a per-layer `rebaseViewProj` call: the narrow site stays exactly one
(`slabViewOf`) for those rows.

`SCALE_UNITS` grows `M_TO_MPC` and `MPC_TO_M` (P4). Registry radii are authored
in metres (`radiusM`), so no conversion happens at draw sites at all — the
`KM_TO_MPC` multiply currently repeated at ten renderer body-frame sites
(`earthLayer`, `atmosphereShell`, `cloudShell`, `planets`, `texturedBodies`,
`starSpheres`, `fieldStarSphere`, `rings`, `baseGlobeFadeAlpha`,
`bodyApparentDiameterPx`) disappears rather than moving.

WESL body shaders take metre uniforms. `raySphereRoots` keeps its reformulated
discriminant (`r² − |perp|²`): in metres the reformulation stops being critical
but stays correct, and it is the shared CPU/WESL primitive for pick and (in spec 2) drag.

## 10. Acceptance criteria

**Visual parity vs `main`, at four representative views** (dev server, user's
eyes; f.lux off before any colour judgement):

1. Whole-globe Earth — limb, terminator, atmosphere, cloud shell, caption
   placement and clipping at the limb (§7.3).
2. Earth close approach at the current zoom floor — tile detail, ocean glint,
   no UV quantization, no black nadir disc.
3. Mars and the Moon resolved, with their host/satellite neighbours in frame —
   painter ordering across body rows, occultation and transit.
4. Solar-system wide, Sun in frame with planets both nearer and farther — the
   §7.1 ordering case, plus glint↔sphere behaviour across the 3 px partition
   boundary.

**Structural:**

- The Mpc-magnitude denormal class of bug is **unrepresentable**: every body-slab
  uniform is in metres, asserted by the grep test in §5 (no `MPC_TO_M` /
  `M_TO_MPC` import outside `bodyRelativePose`) plus a unit test that the black
  -nadir arithmetic (`r²` at Earth radius) lands ≥ 1e12 rather than in f32's
  denormal range.
- Exactly one body-rendering path: `composeBodyMvp` has no body callers left
  (§11-O3 covers the non-body ones).
- The screen-overlap ⇒ disjoint-interval assertion (§7.2) holds across a fixture
  set including Jupiter+Galileans at quadrature and at transit.
- `npm test` and `npm run typecheck` green.
- `npm run perf` measured before and after, per the `perf` skill, against **this
  worktree's own dev-server URL**. Neutral-or-better is the bar; N passes
  replacing one merged pass is the specific risk to measure (MERGED vs PER-LAYER
  vs FLOOR). A neutral-or-negative measurement **halts** the landing pipeline —
  land/park is the user's ruling, not process momentum.

## 11. Open questions — all RULED 2026-08-25

**O1 — the `radiusKm` migration boundary. RULED.** Authored `src/` fields
migrate to `radiusM` (the T1 checkpoint ruling); **baked wire rows stay km**:
`FamousStarRow` (and any other tools/-baked format) keeps its `radiusKm` field
and km values — a wire format, like the `.bin` catalog — converted exactly once
inside `src/data/bodies/makers/star.ts`, which is then literally S3's "one named
site" for that boundary. No data re-bake; P4 does not touch tools/ outputs.

**O2 — `bodyGlintsLayer`. RULED (user, 2026-08-25): stays `slab: NEAR0`,
`target: 'hdr'`.** The glint is depthless additive emission into the HDR
accumulator (the same mechanism star points use, and the reason bloom picks it
up); expanding it per body would mean N extra HDR passes for a handful of points
and would break the single additive accumulation. It is not a parallel
body-_geometry_ path, so S4's one-path rule is intact. S5's minimum on-screen
size for distant-planet findability is recorded as a slab-row parameter, not
built in this landing (no such clamp exists today). Reversible; re-run §10's
perf measurement if reversed.

**O3 — `composeBodyMvp`'s surviving callers. RULED.** After the body migration
its remaining callers are `starSpheresLayer`, `fieldStarSphereLayer`, and
`drawFlooredSpherePick` — all star spheres in the `world-mpc` NEAR0 row, which
S4 explicitly keeps out of body slabs. The util survives with a narrowed
docblock ("star spheres in the world frame"). "The incumbent sphere path is
deleted" reads as _bodies_; the ruling record's own S4 text carries the
star exclusion.

**O4 — `foregroundFrustum` after the migration.** NEAR0's adaptive
altitude-keyed bracket exists because the near-field slab had to hold Earth's
surface and the Sun in one depth buffer. Once bodies own their own rows, NEAR0's
depth-bearing content is star spheres only and its bracket could be derived the
same way §4 derives a body row's. Not in this spec's diff; named so it does not
get silently orphaned.

## 12. File inventory (indicative — the plan confirms exact paths)

New:

```
src/@types/engine/frame/SlabFrame.d.ts
src/@types/engine/camera/BodyRelativePose.d.ts
src/@types/engine/camera/BodyPoseProvider.d.ts
src/services/engine/camera/bodyRelativePose.ts
src/utils/scene/bodyDrawRadiusM.ts
tests/** mirroring the above
```

Modified (prep P1–P4, separate PR — P1 introduces only the `frame` discriminant;
the `near`/`far` rename and `distanceRangeM` are feature-side additions to the
same file):

```
src/@types/engine/frame/Slab.d.ts            (SlabFrame discriminant)
src/services/engine/frame/frameProgram.ts    (static array → builder)
src/services/engine/frame/executeFrame.ts    (step-level depth load-op)
src/data/scaleUnits.ts                       (M_TO_MPC / MPC_TO_M)
src/data/bodies/**, src/@types/scene/*Body.d.ts, + readers   (radiusKm → radiusM)
src/services/engine/frame/deriveBodyStates.ts (radiusM on BodyState)
```

Modified (feature):

```
src/services/engine/frame/slabs.ts                       (body slab rows, painter sort, assertion)
src/services/engine/frame/frameContext.ts                (deriveSlabs inputs)
src/@types/engine/frame/ContentLayer.d.ts                (slab: number | 'body'; enabled takes view)
src/services/engine/frame/passes/{earth,atmosphereShell,cloudShell,planets,texturedBodies,rings}Layer.ts
src/services/engine/frame/passes/foregroundLabelsLayer.ts (coverage source)
src/services/engine/frame/passes/{labels,markerLines,selectionRing}Layer.ts (coverage source)
src/services/gpu/shaders/lib/sceneDepth.wesl              (two tests → one coverage test)
src/services/gpu/renderers/labels/occlusionDepthGroup.ts  (alpha, not depth)
src/services/gpu/shaders/bodies/**                        (metre uniforms)
src/services/gpu/renderers/bodies/**                      (metre uniforms)
src/utils/scene/cutSurfaceTiles.ts                        (metres, body-parameterized)
src/services/engine/frame/runFrame.ts                     (prepareBodySurfaceFrame call site)
src/utils/camera/camPosLocal.ts, lonLatFocusPose.ts       (consume the seam)
src/services/engine/frame/pickProgram.ts                  (body row expansion)
```

Untouched: the tile manifest, band predicates, atlas/LRU residency and fetch
machinery; `SurfaceCutTile`'s shape; the `.bin` catalog path; every COSMO layer.

## 13. Verification plan

**Unit.** `bodyRelativePose` round-trip (world → body → world) at Earth,
Jupiter, and a moon, with a non-identity `orientation`, asserting the ≈14 µm
floor claim; `bodyDrawRadiusM` against rows with and without atmosphere / clouds
/ rings; the painter sort's ordering and the §7.2 assertion against the
Jupiter+Galileans fixtures at quadrature and transit; `deriveSlabs` row count vs
the cull gate; the tile walk's horizon/frustum/LOD tests retargeted at metres.

**Parity.** A test asserting `frameProgram`'s builder emits today's exact list
when no body is visible (P2's no-behaviour-change gate), and that
`slabViewOf`'s narrow is byte-identical for `world-mpc` rows before and after P1.

**Grep.** No import of `MPC_TO_M` / `M_TO_MPC` outside `bodyRelativePose`
(ruled, S3); no `radiusKm` reader left in the renderer body path.

**Visual.** The four views in §10, plus the failure-path check the RTC spec
established: with no manifest, no atlas, and a 404 on every tile, Earth still
lands on the picture it draws without them.

**Then:** `npm run perf` before/after, full suite, `/feature-done` audit.

## References

- [Grill session — globe-camera pivot, 2026-08-24](../../grill-sessions/globe-camera-pivot-2026-08-24.md) — the ruling record; every citation above resolves here.
- `docs/research/2026-08-24-camera-pivot/DESIGN-INPUT.md` (branch `origin/docs/camera-pivot-research`, PR #632) — §3.4 the transform's home, §3.5 the accelerated clock, §4 the precision model.
- [Earth RTC surface camera — design](completed/2026-08-20-earth-rtc-surface-camera-design.md) — the shipped `SurfaceCutTile` / cut-walk foundation §8 re-frames; its Plan 2 is superseded by spec 2.
- [ADR 0010 — continuous per-object floating origin](../../adrs/0010-continuous-floating-origin-for-free-zoom.md) — the f64-compose-then-narrow precision core the `body-m` row makes structural.
- `docs/superpowers/conventions/simplicity.md` §7 (registries over branches), the asymmetry STOP signal §7.2 applies; `conventions/comments.md` (the `nearMpc` rename in §3).
- Seam maps used to write this: `rg-renderer-seams.md`, `rg-ideal-diff.md` (refactor-ground output, 2026-08-24).
