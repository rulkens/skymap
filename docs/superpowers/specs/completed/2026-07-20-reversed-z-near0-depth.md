# Reversed-Z depth on the NEAR0 slab

**Status:** design · 2026-07-20
**Branch:** `worktree-fix-sun-depth-fighting`

## Problem

From the viewpoint of Earth the Sun **z-fights / flickers**. The Sun is a single
opaque UV sphere at the render origin, drawn into the `foreground:0` depth buffer
(`depth32float`, **non-reversed hyperbolic** depth, cleared to `1.0`,
`depthCompare: 'less'`) on the **NEAR0** slab (`starRenderer.ts:148`,
`starSpheresLayer.ts`).

NEAR0's near/far are adaptive (`foregroundFrustum.ts:73-77`):

```
near = max(camDistance · 1e-4, 1e-19)   // MIN_NEAR_MPC
far  = max(camDistance · 100,  3e-11)   // FAR_MIN_MPC — Jupiter's orbit ring floor
```

Focused on Earth (`camDistance ≈ 1e-15` Mpc), `near` floors to `1e-19` and `far`
floors to `3e-11` → **near/far ≈ 3×10⁸**, ~300× past the ~1e5–1e6 the `Slab` type
doc calls the z-fight limit for a depth buffer. The Sun at 1 AU (`4.85e-12` Mpc)
projects to NDC depth `1 − 2e-8`, **inside one float32 ulp of the `1.0` clear**
(ulp ≈ `6e-8` near 1.0). The whole disk quantizes onto the far plane and straddles
the `depth < 1.0` test as `camDistance` jitters frame-to-frame → the flicker.

The Sun (`4.85e-12`) and Jupiter's ring (`2.5e-11`) are only ~5× apart in depth —
trivially resolvable. The budget is destroyed by the **near plane being ~5×10⁷×
closer than any real geometry**, forced tiny by `NEAR_RATIO = 1e-4` while `far`
stays pinned at the Jupiter floor. A single non-reversed float depth buffer cannot
hold this range; the `foregroundFrustum` near-floor and far-floor concerns are
complected through one bracket and cannot both be satisfied.

### Why reversed-Z, not a new slab or a near-clamp

- **New slab** (split the bracket): the *row* is cheap, but it forces per-frame,
  camera-dependent body→slab membership (the Sun migrates NEAR0↔SOLAR as you fly),
  a degenerate-when-zoomed-out case, frame + pick-program surgery, and it leaves
  intra-slab hyperbolic imprecision alive (the `cloudShellRenderer` `depthBias`
  hack exists for exactly that). Permanent machinery to *manage* the constraint.
- **Near-plane clamp** (`near = max(near, far/1e6)`): one line, but when the far
  floor dominates it forces `near ≥ ~900 km` and clips close small-body views —
  trades the Sun bug for an Earth-surface bug.
- **Reversed-Z** *removes* the constraint. Float32 depth precision follows the
  float exponent → near-uniform relative precision (~1e-7) at any ratio. NEAR0's
  `3×10⁸` bracket works as-is, `foregroundFrustum` is **unchanged**, and the
  `cloudShell` bias hack becomes deletable rather than precedent to copy. The
  `depth32float` buffer is already the ideal pairing for reversed-Z, used
  sub-optimally today.

## Goal

The Sun (and every NEAR0 body) renders solidly with correct occlusion from any
viewpoint, from Earth's surface out to Jupiter's orbit, in one depth buffer —
because NEAR0 uses reversed-Z. No behavioural change to what occludes what, to
pick priority, or to caption occlusion.

Non-goals: the COSMO slab (untouched — its pick depth is `depth24plus`, an integer
format reversed-Z does not help, at a fixed range with no precision crisis);
`foregroundFrustum`'s near/far (unchanged); the slab *table* mechanism (stays —
still earns its keep for the f64 origin-relative transform and the NEAR0/COSMO
split; reversed-Z just stops depth precision from ever motivating a new row).

## Approach — make the depth convention a derived per-slab attribute, then flip NEAR0

The NEAR0 depth convention (**clear value + compare direction**) is currently an
implicit global — *smaller-z-wins, clear 1.0* — hardcoded across ~14 pipeline
`depthCompare` literals, 2 clear sites, a `depthBias` sign, and two shader forms.
Reversed-Z on NEAR0 *only* forces that global to become **per-slab**. Rather than
hand-flip every replicated site (a bolt-on; miss one → silently inverted occlusion,
no compile error), the convention becomes a single derived attribute the sites read.

The convention is encoded in **three** forms, all of which flip together for NEAR0:

1. **Pipeline `depthStencil.depthCompare`** (TS, per-renderer).
2. **A manual sampled-depth compare** — `sceneDepth.wesl::occludedByScene`
   (`< fragDepth`), the near-field caption-occlusion consumer (#461).
3. **The pick-priority band mapping** — the eps→clip.z mapping in the NEAR0 pick
   shaders, single-sourced through `pickDepthBands.wesl`.

Forms 2 and 3 are each already single-sourced in one WESL lib file — the right home
for a convention flip. Form 1 becomes single-sourced via the prep below.

### Reversed-Z semantics (feature) — **infinite-far**

The NEAR0 projection becomes **infinite-far reversed-Z**: `mat4d.perspectiveReverseZ(fov, aspect, near)`
with `zFar` **omitted** (near→NDC 1, distance→∞ maps toward NDC 0). Clear to `0.0`,
greater-wins. Infinite-far is chosen (over finite-far reversed-Z) because it is the
best-precision variant *and* because with no far plane nothing is ever beyond-far,
which makes the far-plane clip-survival clamps (below) harmless no-ops — sidestepping
a cross-slab shader-sharing problem entirely.

Flip surface:

- `depthCompare`: `'less'` → `'greater'`, `'less-equal'` → `'greater-equal'` (all
  NEAR0 content + pick renderers; COSMO pick unchanged).
- Depth clear: NEAR0 `foreground:0` + `pick:near0` → `0`; COSMO `pick:cosmo` → `1`.
- `sceneDepth.wesl`: `textureLoad(...) < fragDepth` → `> fragDepth` (a nearer body
  now has a *larger* stored depth; empty sky is `0.0` → caption kept).
- **Pick priority bands** (NEAR0-only pick shaders — `starPointPick.wesl`,
  `milkyWayPick/vertex.wesl`, `starCatalog/vertex.wesl` pick branch), two forms:
  - **forced band** `clip.z = clip.w · (1 - eps)` → `clip.z = clip.w · eps`.
  - **scene-star min-clamp** `min(clip.z, clip.w·(1-eps))` → `max(clip.z, clip.w·eps)`
    (`starPointPick.wesl::vs`). The **operator flips too**, not just the mapping.

  The eps **constants and their order are unchanged**. The resolved-sphere-vs-band
  threshold is governed by `near/z_view` in *both* conventions, so the same eps
  values preserve every priority relationship (sphere beats glint when nearer than
  ~orbitDistance/4; Earth-glint > planet > moon > scene > survey > backdrop) — **no
  recalibration**. The bands just sit just *above* the `0.0` clear instead of just
  *below* the `1.0` clear.
- `cloudShell` `depthBias`: `-4/-2` → `+4/+2` (pull toward camera now means larger
  z) — or delete if the visual pass shows it is no longer needed.

**NOT in the flip surface — the visual far-plane clip-survival clamps stay as-is.**
Six depthless NEAR0 visual passes clamp clip-z to keep beyond-far content from
being frustum-clipped (`starPoints/vertex.wesl:121`, `bodyGlint/vertex.wesl:75`,
`milkyWayCloud/{dust,stars}.wesl`, and the two **shared-with-COSMO** shaders
`labels/vertex.wesl:83` + `markerLines/vertex.wesl:81`). Under **infinite-far**
reversed-Z there is no beyond-far, so these `min(z, w·(1-eps))` clamps become
harmless near-caps (`z ∈ (0,1]` always survives) and need **no change** — including
the two shared shaders, whose COSMO instance keeps working unchanged. This is the
crux benefit of infinite-far: the cross-slab shader problem does not arise.

`foregroundFrustum` is **unchanged**; its `far` is now vestigial for the NEAR0
projection (which ignores it) but is retained for the world-space anchor clamps
(`NEAR0_FAR_CLAMP_FRACTION`), with a comment noting the projection no longer uses it.

Because the depth buffer is used only by NEAR0 (COSMO content is depthless; COSMO
*pick* writes a separate `depth24plus` texture), the COSMO pick pipelines keep
`less` / clear `1.0` untouched — the split falls exactly on the NEAR0/COSMO seam.

## Architecture — the ideal diff

Data delta first.

### Prep PR — derive the convention (behavioural no-op)

```ts
// @types/engine/frame/Slab.d.ts — new field
reversedZ: boolean;   // true ⇒ clear 0.0, greater-wins, perspectiveReverseZ

// @types/rendering/DepthIntent.d.ts — new one-type file
export type DepthIntent = 'nearer' | 'nearer-or-equal';

// slabs.ts — the single source, next to NEAR0/COSMO (both false in PREP)
export const SLAB_REVERSED_Z: Readonly<Record<number, boolean>> =
  { [NEAR0]: false, [COSMO]: false };
// deriveSlabs copies SLAB_REVERSED_Z[index] onto each Slab.reversedZ

// utils/gpu/resolveDepthCompare.ts — one fn
resolveDepthCompare(intent: DepthIntent, reversedZ: boolean): GPUCompareFunction
//   ('nearer',          false)→'less'        ('nearer',          true)→'greater'
//   ('nearer-or-equal', false)→'less-equal'  ('nearer-or-equal', true)→'greater-equal'

// utils/gpu/depthClearValueFor.ts — one fn
depthClearValueFor(reversedZ: boolean): number   // false→1, true→0
```

Threading (all reading the same `reversedZ`, byte-identical while it is `false`):

- Every depth-drawing renderer factory gains a `reversedZ: boolean` arg beside its
  existing `depthFormat` arg, and replaces its literal `depthCompare: '...'` with
  `resolveDepthCompare(<its fixed intent>, reversedZ)`. Intent per renderer:
  `atmosphereShellRenderer` → `'nearer-or-equal'`; all others → `'nearer'`.
  Sites: `planetRenderer:183`, `starRenderer:148`, `earthRenderer:465`,
  `texturedBodyRenderer:221`, `ringRenderer:214`, `cloudShellRenderer:250`,
  `atmosphereShellRenderer:397`, `bodyPickRenderer:254`/`:310`,
  `starCatalogPickRenderer:131`, `milkyWayPickRenderer:158`
  (NEAR0); `galaxyCatalog/pickRenderer:140`, `proceduralDiskRenderer:201`,
  `structureMarkerRenderer:329` (COSMO — receive `SLAB_REVERSED_Z[COSMO]`).
- `initGpu.ts` passes `SLAB_REVERSED_Z[NEAR0]` / `[COSMO]` per renderer (the same
  place it already passes `depthFormat`; the renderer→slab echo already exists there).
- Clear sites read `depthClearValueFor(slab.reversedZ)`: `executeFrame.ts:134`
  (the `foreground:0` clear), `pickProgram.ts:202` (per-slab pick clear).
- `computeForegroundViewProj` gains a `reversedZ` param → `mat4d.perspectiveReverseZ(fov, aspect, near)`
  (`zFar` omitted = infinite-far) when true, else `mat4d.perspective(fov, aspect, near, far)`
  (unchanged for prep). `deriveSlabs` passes `near0.reversedZ`.

No `.bin` / registry / store change. `foregroundFrustum` unchanged.

### Feature PR — flip NEAR0

- `SLAB_REVERSED_Z[NEAR0] = true` (one edit; every TS form + the infinite-far
  projection follow).
- `sceneDepth.wesl:30` `<` → `>` (+ header rationale flip).
- Pick bands (NEAR0-only pick shaders): forced `(1 - eps)` → `eps`
  (`starPointPick.wesl::vsGlint:176`, `milkyWayPick/vertex.wesl:79-80`,
  `starCatalog/vertex.wesl` pick branch); scene-star clamp
  `min(z, w·(1-eps))` → `max(z, w·eps)` (`starPointPick.wesl::vs:130`).
  `pickDepthBands.wesl` header updated; **eps constants unchanged** (no recalibration
  — the sphere-vs-band threshold is `near/z_view` in both conventions).
- `cloudShellRenderer.ts:281-282` bias signs `-`→`+` (or delete the bias entirely
  if the visual pass shows reversed-Z resolves the cloud-over-Earth tie without it
  — decide during execution against [V3]).
- Doc-comment restatements of `depthCompare: 'less'` / clear `1.0` in the NEAR0
  `.d.ts` files and pass headers updated to the reversed convention.
- **Untouched:** the six visual clip-survival clamps (see "Reversed-Z semantics")
  — harmless under infinite-far; the two shared-with-COSMO shaders stay static.

### Delivery — one PR

Prep + feature + docs land together in a single PR (user decision). The prep
commits (deriving the convention, `reversedZ = false`) go in first as a
byte-identical no-op, then the flip commit turns `SLAB_REVERSED_Z[NEAR0]` on and
inverts the shader-side forms — so the history still reads as "derive, then flip,"
just within one PR rather than two.

### Why `reversedZ` at construction *and* on the `Slab`

`depthCompare` is immutable at pipeline creation, so renderers must know the
convention at `initGpu` construction time (before any frame). The clear value is
chosen per-pass at frame time, so it reads `Slab.reversedZ`. Both derive from the
one `SLAB_REVERSED_Z` constant — construction reads it directly; `deriveSlabs`
echoes it onto the runtime `Slab`. This mirrors the existing `depthFormat`, which
is likewise passed at construction *and* declared on the target row, and must
match.

## Ground preparation

**Prep PR = the derived-convention refactor above** (own PR, before the feature).
It lands with `reversedZ = false` everywhere, so pipelines are byte-identical and
every existing depth test stays green — a pure, independently-reviewable no-op that
turns the implicit *smaller-z-wins/clear-1.0* global into one derived per-slab
attribute. refactor-ground verdicts:

| Touchpoint | Verdict | Why / blocker |
|---|---|---|
| NEAR0 projection | **growth** | separate `computeForegroundViewProj` already exists — 1-line builder swap behind a param |
| `depthCompare` ×11 NEAR0 pipelines | **bolt-on** → prep | convention hardcoded at each site; miss one ⇒ inverted occlusion, no compile error. Joint: `resolveDepthCompare` + threaded `reversedZ` |
| depth clear ×2 (one shared across pick slabs) | **bolt-on** → prep | literal `1` not derived. Joint: `depthClearValueFor` + per-slab clear |
| `cloudShell` `depthBias` | **growth** | single site, sign tied to the flag |
| `sceneDepth.wesl` sampled compare | **growth** | already single-sourced (one lib fn) |
| pick bands | **growth** | already single-sourced (`pickDepthBands.wesl`) |

The user chose the **full derived attribute** over a raw hand-flip so a future
depth-convention change (or a third slab) touches one constant, not 14 sites, and
so a partial flip is impossible.

**Adjacent findings** (not required by this diff; backlog, not folded in): the
NEAR0 *pick* renderers hardcode their depth **format** (`'depth32float'` literal)
rather than receiving it like the body renderers receive `depthFormat` — a parallel
inconsistency to the convention one. Default: `docs/backlog/` detail file.

(refactor-ground checkpoint signed off 2026-07-20.)

## Performance

Zero cost. Reversed-Z is the same projection matrix built with swapped
near/far coefficients and one flipped compare op — no extra passes, draws, texture
memory, or bandwidth. The depth format (`depth32float`) is unchanged. If the
`cloudShell` `depthBias` is deleted (pending the visual pass), that is a marginal
*saving*.

## Testing

Per `testing.md` — test what breaks on a real bug no compiler/other test catches.

**Prep PR:**
- `resolveDepthCompare` — the four `(intent, reversedZ)` → `GPUCompareFunction`
  mappings, asserted once. This is the single source of the occlusion direction;
  an inverted entry silently flips every NEAR0 body's occlusion with no type error,
  so the truth table earns a test (not a mere constant restatement).
- `depthClearValueFor` — `false→1`, `true→0`, asserted once (same rationale).
- **The existing per-renderer pipeline tests are the no-op guard** — `starRenderer.test.ts:74-76`,
  `planetRenderer.test.ts`, `ringRenderer.test.ts`, `executeFrame.test.ts:495`
  (`depthClearValue 1`), `pickProgram.test.ts:356` (`1.0`), `renderTargets.test.ts:106`
  must **stay unchanged and green**, proving prep changed no descriptor.

**Feature PR:**
- **New regression test** (`foregroundFrustum` / `computeForegroundViewProj`): with
  a representative Earth-view frustum (near/far from `foregroundFrustum(1e-15)`) and
  the Sun at `4.85e-12` Mpc, the Sun's projected NDC depth differs from the far-plane
  clear by **more than one float32 ulp** — fails today (Sun collapses onto the clear),
  passes under reversed-Z. Pure matrix math, no GPU.
- Update the per-renderer/executor/pick tests to the reversed values for NEAR0
  (`'greater'` / `'greater-equal'` / clear `0`); COSMO pick tests unchanged.
- Update any assertion pinning the pick-band `(1 - eps)` mapping.
- **No test for:** the GPU depth test itself (visual), the eps *constants*
  (unchanged), or doc restatements.

### Visual verification (real device — load-bearing)

Dev server with real data linked (`http://localhost:5176`):

- **[V1]** From Earth looking at the Sun: the Sun is a **solid, stable disk** — no
  flicker, no holes, at rest and while auto-rotating.
- **[V2]** Two planets roughly in line: the nearer occludes the farther correctly
  (occlusion direction not inverted).
- **[V3]** Earth close-up: surface, cloud shell, atmosphere shell, and rings layer
  correctly (no inverted cloud/atmosphere, no new z-fight on the cloud shell —
  confirm whether the `depthBias` is still needed).
- **[V4]** Near-field captions still **occlude behind nearer bodies** (#461 path:
  `sceneDepth.wesl` compare correctly inverted — captions hidden behind a nearer
  planet, kept over empty sky).
- **[V5]** Click-picking priority unchanged: a famous/scene star out-picks an
  overlapping Gaia dot; a planet's disk out-picks its glint; the Milky Way backdrop
  loses to any dot (pick bands correctly inverted).
- **[V6] iOS pass** — the `perspectiveReverseZ` projection and the flipped shaders
  compile and present on WebKit (stricter than Tint; a bad shader silently drops
  the whole frame — see CLAUDE.md). Confirm via `createShaderModuleWithDevLog`.
