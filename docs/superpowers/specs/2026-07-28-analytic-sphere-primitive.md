# Analytic sphere primitive for body rendering

**Status:** approved design, spec'd 2026-07-28. Every scope decision below was settled in
[`docs/grill-sessions/analytic-sphere-primitive-2026-07-28.md`](../../grill-sessions/analytic-sphere-primitive-2026-07-28.md)
(seven questions, with the rejected alternatives recorded there). This spec is written against
that transcript and against the code as it stands at `e4bd0dbb`; it does not re-open settled
questions. Where the code contradicted a claim made during the grill, the correction is
recorded in "Corrections to the grill record" at the end — one of them is load-bearing and is
settled by Q7, folded into "Ground preparation" below.

Supersedes `docs/backlog/2026-07-24-atmosphere-limb-transparent-seam.md`, which began as
"raise the vertex count a bit" and escalated once the seam's mechanism was pinned down. That
detail file and its `BACKLOG.md` index line are deleted by this work.

## Problem

Every sphere body is drawn as a tessellated UV mesh at 48×24
(`src/data/bodies/sphereTessellation.ts`). A UV sphere's silhouette is a polygon **inscribed**
in the true circle, short of it by `1 − cos(half-step)` — at a 3.75° half-step, **0.214% of the
radius**. Three consequences, in descending order of how much they bother a user:

1. **The transparent limb seam.** `atmosphereShellRenderer`'s fragment intersects an
   **analytic** ground sphere at `u.bottomRadius`
   (`shaders/atmosphere/shell/fragment.wesl:139`), where `bottomRadius` is the physical ratio
   `planetRadiusKm / atmosphereTopKm` (`packAtmosphereUniforms.ts:75`) — nothing
   tessellation-derived. So the shell's inner edge is a perfect circle while the surface's
   drawn edge is a 48-gon 0.214% inside it. The sliver between them is outside the surface and
   inside the shell's hole: **nothing rasterises it**, and the background shows straight
   through. Observed on Mars, 2026-07-24.
2. **A faceted limb against black sky.** Visible on any body you fly close to.
3. **The pick edge and the drawn edge are separately defined.** They agree today only because
   both read the same constant. Nothing enforces it beyond that shared read.

Raising the tessellation narrows all three and closes none, at a per-frame vertex cost paid by
every body including the three-pixel-wide ones. `uvSphereMesh` returns `Uint16Array` indices,
so `(rings+1)·(segments+1) ≤ 65536` caps the ceiling near 256×128 anyway.

## Solution

Ray-trace the sphere analytically in the fragment. The mesh stops being the surface and becomes
a **circumscribing proxy** whose only job is to make the fragment stage run over every pixel the
true sphere can touch; every fragment casts a ray from the camera through its own proxy
position, intersects the analytic unit sphere, and derives normal, uv and depth from that hit.

`composeBodyMvp` bakes the body's radius (and any flattening) into the model scale
(`composeBodyMvp.ts:96-103`), so in the local frame this shader works in **every body is the
unit sphere**. The ray origin is the camera in that same frame — `camPosLocal`, a vector the
textured fragment already carries for its Minnaert view cosine. No new uniform on the visual
path.

The drawn edge then coincides **exactly** with the analytic radius the atmosphere shell already
tests against, so the seam closes by construction rather than by tuning an overlap.

Proven and visually confirmed as a spike at `e4bd0dbb`, gated behind `?impostor`.

## Scope

| renderer                          | verdict      | why (grill Q)                                                                 |
| --------------------------------- | ------------ | ----------------------------------------------------------------------------- |
| `texturedBodyRenderer`            | **converts** | the spike; 12 bodies, the seam's home                                         |
| `bodyPickRenderer` (`drawSphere`) | **converts** | Q5 — identical-by-construction beats close-enough                             |
| `earthRenderer`                   | stays mesh   | Q1 — a deep-zoom Earth surface effort is in flight and needs its own renderer |
| `starRenderer`                    | stays mesh   | Q3 — conversion requires the oblateness frame fix, which Q2 holds             |
| `planetRenderer`                  | stays mesh   | Q4 — the only bodies it permanently draws are Phobos and Deimos               |

**Out of scope, explicitly:** oblateness work of any kind (Q2) — no ellipsoid normals, no
flattening Saturn or Jupiter, no `*Local` family rename, no reopening the atmosphere shell's
scalar `bottomRadius`. See correction #3 for the one narrow exception the pick conversion
forces.

**The mesh shading path is deleted, not kept behind a flag** (Q6). A fallback nobody exercises
is a fallback that rots, and two paths means every future change to body shading is made twice
or silently diverges. The iOS risk that would motivate keeping it is answered by **sequencing**
— on-device confirmation gates the merge — not by a code artefact.

The mesh itself does not disappear: `uvSphereMesh(48, 24)` remains, as the 1.05× proxy.

## Ground preparation

Ideal-diff pass run 2026-07-28 (grill "Resulting scope" table). **Two items.**

**Growth (seams exist, no prep needed):**

- `TexturedBodyUniforms` (`shaders/lib/sphere.wesl:181-191`) already carries `camPosLocal` —
  added for the Minnaert emission cosine, and the exact ray origin the impostor needs. The
  visual path's uniform layout is **unchanged**, all 112 bytes of it.
- The vertex buffers are reused as-is: `uvSphereMesh` positions at `@location(0)`, uvs at
  `@location(1)`. The renderer swaps two shader modules and a cull mode, no second geometry
  upload.
- `raySphere` already exists at `shaders/lib/util.wesl:143`, with the CPU twin
  `utils/math/raySphereRoots.ts`.
- `drawFlooredSpherePick` (`services/engine/helpers/drawFlooredSpherePick.ts`) is already the
  single funnel through which all four sphere-pick call sites pass, and it already holds every
  input the analytic pick needs: `camPosMpc`, `positionMpc`, the floored radius, `orientation`,
  `oblateness`. The pick's new uniform field is composed there and nowhere else.

**Bolt-on (missing joint), and the prep that creates it. Its own commit, its own PR, sequenced
before any feature commit:**

- **P1 — `src/services/gpu/shaders/lib/analyticSphere.wesl`.** The spike keeps ray-hit,
  equirect uv, the wrap-safe gradient pair and the frag-depth projection inline in
  `impostorFragment.wesl`. `bodyPickRenderer` needs the first and the last of those, and Earth's
  new renderer is a likely third consumer (a renderer built for zooming into a surface wants an
  exact silhouette more than any other). Extract the four into a lib module and repoint
  `impostorFragment.wesl` at it, **with no behaviour change**.
- **P2 — `camPosLocal` gains an optional `oblateness` parameter, default 0.** Contract change:
  `camPosLocal(camPosMpc, bodyPosMpc, radiusMpc, orientation, oblateness?: number)` divides the
  local z component by `1 − oblateness` when given; omitted or `0`, the function returns exactly
  what it returns today. `bodyPickRenderer` is one renderer serving every body type, and
  `starSpheresLayer.ts:178` passes `star.oblateness` into `drawFlooredSpherePick` for the six
  famous stars that carry a non-zero value — so converting the pick (below) converts it for
  those stars regardless of `starRenderer` staying on the mesh. Without the parameter, the
  analytic pick's ray origin is wrong by `1/(1 − oblateness)` along the polar axis, silently,
  because the star still draws correctly through the mesh. The default is what keeps the four
  existing callers byte-identical: none of them passes a fifth argument, so none of them changes
  behaviour. See Q7 in the grill transcript for the full reasoning and rejected alternatives.

**Dropped during the ideal-diff pass** (recorded so nobody re-adds it):

| dropped item               | why                                                    |
| -------------------------- | ------------------------------------------------------ |
| `packTintedSphereUniforms` | only needed to convert `starRenderer`, which Q3 holds. |

**Not prepped, deliberately:** `PROXY_SCALE` stays a module-local const in the textured body's
vertex stage until the pick conversion makes it a second consumer, at which point it graduates
into `lib/analyticSphere.wesl`. That is exactly the promotion criterion `lib/util.wesl`'s own
header states ("as soon as a function gains a second consumer"), applied rather than pre-empted.

## Architecture

Written against the post-P1 tree, as if `lib/analyticSphere.wesl` already existed.

### `shaders/lib/analyticSphere.wesl`

One cohesive module, not one function per file — WESL resolves the last path segment as the
symbol name, so a per-file split forces `package::lib::analyticSphere::hitUnitSphere::hitUnitSphere`
(the `lib/math.wesl` precedent).

```wgsl
// The hit flag and the surface point, together, because a caller that takes one
// always takes the other.
struct SphereHit {
  hit: bool,
  // ALWAYS unit length. On a hit it is the true surface point (and therefore the
  // exact geometric normal); on a miss it is the closest-approach point projected
  // onto the sphere, which is C0-continuous with the true hit across the limb.
  point: vec3<f32>,
};

struct UvGradients {
  ddx: vec2<f32>,
  ddy: vec2<f32>,
};

// The equirectangular map-centre registration offset. WESL cannot import the TS
// TEXTURE_PRIME_MERIDIAN_U, so the 0.5 is re-encoded here.
const TEXTURE_PRIME_MERIDIAN_U: f32 = 0.5;

fn hitUnitSphere(ro: vec3<f32>, rd: vec3<f32>) -> SphereHit;
fn equirectUvFromDir(dir: vec3<f32>) -> vec2<f32>;
fn equirectUvGradients(uv: vec2<f32>) -> UvGradients;
fn fragDepthFromLocal(mvp: mat4x4<f32>, pLocal: vec3<f32>) -> f32;
```

Four facts the module owns, each currently inline in the spike
(`impostorFragment.wesl:143-209`) and each cited by its rationale there:

1. **`hitUnitSphere`** — near-positive-root selection over `raySphere` (entry point when the
   camera is outside, exit point in the degenerate camera-inside case), plus the grazing
   fallback. The fallback exists because `dpdx`/`dpdy` require uniform control flow and
   therefore run **before** any `discard`: the missed lanes of a limb quad must still produce a
   plausible point or they poison their neighbours' gradients. Returning a unit-length point
   unconditionally is what lets one function serve both the textured path (which needs the
   fallback) and the pick path (which discards immediately and never observes it) with no
   variant flag.
2. **`equirectUvFromDir`** — the uv convention `uvSphereMesh` bakes into its vertices:
   `u = lon / TAU + TEXTURE_PRIME_MERIDIAN_U`, `v = lat / PI + 0.5`, south-first v, with
   `lat = asin(clamp(dir.z, -1, 1))` and `lon = atan2(dir.y, dir.x)`. `atan2` returns
   `(-PI, PI]`, so the raw u lands in `(0, 1]` rather than the mesh's `[0.5, 1.5)`. Those differ
   by exactly one whole turn on the far hemisphere and the sampler addresses u as `repeat`, so
   the **sampled texel is identical** — the wrap is the hardware's job, and reproducing the
   mesh's unwrapped range would be a branch that buys nothing.
3. **`equirectUvGradients`** — the wrap-safe pair. Per-fragment u jumps by 1.0 across the
   antimeridian, so a 2×2 quad straddling it sees `dpdx(u) ≈ 1`, asks for a footprint an entire
   texture wide, and picks the coarsest mip: a bright blurred one-pixel line down the body. The
   fix builds a **second** u shifted half a turn (`fract(u + 0.5)`), whose own discontinuity
   sits on the prime meridian, and per axis keeps whichever derivative has the smaller
   magnitude. Any quad small enough to matter straddles at most one of the two seams, so on the
   seam this discards the spurious whole-turn jump and everywhere else the two are equal and
   the choice is a no-op. The mesh path never needed this because its vertex u is monotonic.
4. **`fragDepthFromLocal`** — projects the analytic hit through the **same** mvp the vertex
   stage used and returns `clip.z / clip.w`, byte-for-byte what the rasteriser would have
   produced had it drawn the true surface. Reversed-Z lives entirely inside the projection
   matrix, so `clip.z / clip.w` already comes out in `[0, 1]` with 1 at the near plane on the
   NEAR0 slab. There is **no flip to apply**, and the expression stays correct if the slab's
   convention is ever switched — emitting `1 - z`, or reading `SLAB_REVERSED_Z`, would be the
   bug.

Once the pick converts, `PROXY_SCALE` (1.05) joins the module as a fifth export.

### `texturedBodyRenderer` — the analytic path becomes the only path

- **Vertex** inflates each mesh position by `PROXY_SCALE` and forwards it as the sole varying.
  The proxy must strictly **circumscribe** the true sphere or its outline clips the analytic
  sphere it exists to reveal, shaving exactly the limb pixels this feature recovers:
  `1.05 · cos(3.75°) = 1.0478 > 1.0`, comfortably outside at any camera distance.
- **`cullMode: 'front'`** — the far hemisphere of the proxy rasterises. Front faces would vanish
  the moment the camera crossed inside the 1.05 shell (a legal close approach, 5% of a body
  radius above the surface) and the body would disappear. Back faces still cover the whole disc
  from in there, because the near hemisphere is behind the eye.
- **Fragment** renormalizes `rd = normalize(localPos − camPosLocal)` **after** interpolation —
  `localPos` rides a 1.05-scaled proxy, so neither it nor its interpolant is unit length, and
  skipping the renormalize silently breaks every dot product downstream (the house
  "renormalize after a scaled model transform" trap). It then takes derivatives, discards the
  missed lanes, and shades exactly as the mesh fragment did: `perturbNormal` over the relief
  map, `litShade`, `ringSunVisibility`, Minnaert `limbDarkening`. Both texture reads use
  `textureSampleGrad` with the corrected gradient pair, since both sample the same uv.
- **`@builtin(frag_depth)` is mandatory.** The rasteriser's interpolated depth belongs to the
  **proxy** (1.05× radius, far hemisphere), nowhere near the surface, so leaving it alone would
  put every body behind everything else. Two consequences: early-Z is disabled for this
  pipeline, and a hit nearer than the near plane is **clamped** to 1.0 rather than clipped away
  (the vertex-stage near clip no longer governs what is shaded).
- **`ringSunVisibility` collapses to one copy.** It is currently duplicated verbatim between
  `texturedBody/fragment.wesl:114-148` and `impostorFragment.wesl:121-140`; deleting the mesh
  fragment leaves the analytic one as the only copy, which the spike's own comment anticipates.
- **Files.** `texturedBody/{vertex,fragment,io}.wesl` are deleted and the `impostor*` trio takes
  their names. That rename is not cosmetic: **"impostor" already means something else here** —
  billboard impostors for galaxies and the Milky Way (`wireImpostorSubsystems.ts`,
  `galaxyImpostorBaseline.test.ts`, `lib/focusUniforms.wesl`). Leaving a ray-traced sphere
  called an impostor plants a permanent collision in a codebase that already uses the word for
  the opposite technique. The `?impostor` URL gate and its `hasUrlGate` import go with it.
- **Uniform layout, bind-group layout, `KIND_CFG`, the per-body buffer/bind-group map,
  `setMap`/`setPlaceholderMap`/`clearMap`/`hasMap`/`setRingTexture`: all unchanged.**

### `bodyPickRenderer.drawSphere` — the same silhouette, from the same code

The pick silhouette must agree with the drawn silhouette or a click near the limb resolves
against an edge that is not where the pixel is. This is **already live and broken** under
`?impostor`: the drawn edge is exact while the pick edge is the polygon 0.214% inside it,
leaving a hairline ring that looks like the planet but does not respond to clicks. Raising the
pick mesh alone to 256×128 would push that below the noise floor (0.0075%) without removing the
class — two notions of the silhouette would still exist and could drift again — and it would
invert the stated rationale of `sphereTessellation.ts`, whose whole purpose is pick and visual
sharing one tessellation.

The pick pass is also the **cheapest place in the renderer to pay for `frag_depth`**: a tiny
on-demand pass, a handful of bodies, no shading, so the lost early-Z costs nothing that matters.

- `spherePick.wesl` gains a `SpherePickVSOut` varying struct (clip + proxy `localPos`) and a
  `PickFSOut` output struct. **`fsPick` must write `@builtin(frag_depth)`** from the analytic
  hit. Without it the fragment keeps the proxy's interpolated depth — 5% too near, far
  hemisphere — and depth-tested nearest-wins occlusion **silently breaks**: a Moon in front of
  Earth stops resolving correctly, with no error anywhere. This is the single highest-risk line
  in the whole feature.
- Only one struct in the module carries `@builtin(position)`, so the documented runtime-only
  duplicate-builtin landmine does not arise. It **would** arise if a second position-bearing
  struct were ever added to this module.
- The pick fragment needs no derivatives and samples nothing, so it discards immediately on a
  miss. The grazing fallback is computed and unobserved.
- `cullMode` flips `'back'` → `'front'`; the vertex inflates by the shared `PROXY_SCALE`.
- **The proxy does not widen the hit area.** The fragment discards outside the analytic unit
  sphere, so the effective pick silhouette is exactly the model radius — the 5% inflation is
  scaffolding that never reaches the target.

#### The pick radius floor composes unchanged

`minPickRadiusMpc` floors the **model radius in Mpc** before `composeBodyMvp` bakes it into the
model scale (`drawFlooredSpherePick.ts:65-73`). It is a CPU-side radius inflation, not a mesh
trick: the mesh never knew about it, and neither does the analytic sphere. In the local frame the
floored sphere **is** the unit sphere, exactly as the true sphere is on the visual path. The only
requirement is that the new `camPosLocal` be divided by the **same floored radius** the mvp was
composed with, which is automatic because both are computed in `drawFlooredSpherePick` from the
one `pickRadiusMpc` local. No redesign, no new special case.

Depth behaviour is likewise unchanged in kind: the floored sphere is drawn nearer than the true
surface today too, because the mesh is drawn at the floored radius.

#### `SpherePickUniforms` — 80 bytes, still

`camPosLocal` fills the layout's existing padding rather than opening a new 16-byte row, via the
pad-slot-becomes-real-field trick the sibling structs already use
(`RingUniforms.planetRadiusRatio`, `CloudShellUniforms.cloudOpacity`):

```
offset  0..63  mvp          mat4x4<f32>   column-major, 64 B
offset 64..75  camPosLocal  vec3<f32>     16-byte aligned at 64; the ray origin
offset 76..79  packedId     u32           fills the vec3's trailing slot — a REAL field, not a pad
total: 80 bytes (unchanged)
```

CPU scratch mirror: `f32[0..15] = mvp`, `f32[16..18] = camPosLocal`, `u32[19] = packedId`. The
buffer size, the 256-byte dynamic-offset slot stride, `minBindingSize` and `MAX_SPHERE_DRAWS`
are all unaffected. (The grill costed this at 80 → 96 B; see correction #2.)

`BodySpherePickArgs` grows one field:

```ts
export type BodySpherePickArgs = {
  readonly mvp: Float32Array;
  /** Camera in the body's local frame, in FLOORED-pick-radius units — the ray origin. */
  readonly camPosLocal: Readonly<Vec3>;
  readonly packedId: number;
};
```

## Verification

### A clean `npm run build` does not prove a shader compiles

`?static` linking is build-time text linking. The WESL linker and `tsc` both pass on WGSL that
`device.createShaderModule` rejects — the duplicate-`@builtin(position)` landmine is the
documented case, and it fails **only** at module creation. **Every task that touches a `.wesl`
file therefore carries its own visual acceptance step**, run against the dev server with the
console open, not a single check at the end of the plan. `createShaderModuleWithDevLog` prints
the real `getCompilationInfo()` error plus the linked WGSL, which is the only way to map
"error at line 142" back to a source file.

### iOS is a merge gate, not a footnote

The mesh fallback is being **deleted**, so the analytic path must be confirmed on iOS/WebKit
**before** the PR that deletes it merges. This codebase has been bitten by WebKit being stricter
than Tint (`texture_1d` sampling is the recorded case), and the failure mode is silent: all HDR
passes share one command encoder, so an invalid pipeline makes `encoder.finish()` produce an
invalid command buffer and `queue.submit()` drops the **entire** frame. The loop ticks, the
camera moves, the React UI updates, and nothing ever presents — no thrown error.

The analytic path uses four things a stricter implementation could differ on: `frag_depth`,
`textureSampleGrad`, derivatives taken **before** a `discard`, and a `bool` field in a
function-scope struct.

The device path is already wired: `SKYMAP_HTTPS=1 npm run dev` binds `0.0.0.0` and serves the
mkcert LAN cert, because WebGPU needs a secure context and a bare LAN IP is not one
(`vite.config.ts:9-51`).

### Perf

Not expected to move, and not a gate. The change trades ~1,200 vertices per body for a handful
of extra fragment ALU ops and the loss of early-Z on ≤12 bodies that occupy a small fraction of
the frame. If a before/after is wanted it goes through `npm run perf` with `--url` pointed at
**this worktree's** dev server.

## Testing

Per [`docs/superpowers/conventions/testing.md`](../conventions/testing.md) — judged by "will
this ever fail on a real bug that no other test or compiler check catches".

**Earns a test:**

- **`camPosLocal`'s oblateness correction** (correction #3) — a pure function with a
  hand-computed expectation. Real bug class, no compiler check, and the existing four callers
  passing oblateness 0 must keep byte-identical results.
- **`SpherePickUniforms` byte offsets ↔ the CPU scratch** — the keep-rule for WGSL/TS uniform
  layout parity. `packedId` living in a vec3's trailing slot is precisely where a wrong offset
  hides, and the symptom is a silently-dropped frame on iOS, not a test failure. Sits alongside
  `tests/services/gpu/shaders/sphereUniforms.test.ts`.

**Does not earn a test:**

- **The shader maths** — ray-sphere, equirect uv, the wrap-safe gradients, the frag-depth
  projection. None is reachable without a GPU; the mock device rasterises nothing, so a green
  test proves only that a string was passed to a stub. Covered by the per-task visual
  acceptance and the iOS gate.
- **`cullMode: 'front'`, `PROXY_SCALE = 1.05`** — constant restatements. The `git diff` a human
  reviews shows them plainly, and a wrong value is instantly visible on screen.
- **The mesh path's deletion** — nothing to assert. The existing `texturedBodyRenderer` tests
  assert layout, sampler, per-body buffers and mip generation; none touches the shading path, so
  none should need editing. If one does, that is a signal the deletion reached further than
  intended.

A future implementer who adds one of the second group should delete it again.

## Corrections to the grill record

**1. `sphereTessellation.ts`'s header cites a helper that does not exist.** It claims the
atmosphere shell "derives its ground-occlusion test radius from these counts via
`inscribedSphereRadiusFactor`". There is no such symbol anywhere in the repo, and
`packAtmosphereUniforms` takes `bottomRadius = planetRadiusKm / atmosphereTopKm` — purely
physical. The shell has **never** tracked the tessellation; that mismatch is the seam's actual
mechanism, not a guard against it. The header's text was merged in #510 and corrected in #512;
after this feature the constant describes **only** the impostor's 1.05× proxy geometry and not
the visual silhouette at all, so it needs rewriting a third time, and this false claim removed
in the same pass.

**2. `SpherePickUniforms` does not need to grow to 96 bytes.** The grill costed Q5's Option A at
"80 B → 96 B for `camPosLocal`". That was a sizing estimate inside the option description, not
the decision; the decision was "convert". Placing `packedId` in the vec3's trailing slot keeps
the struct at 80 bytes with no change to the buffer, the slot stride, `minBindingSize` or
`MAX_SPHERE_DRAWS`, and matches the house idiom three sibling structs already use.

**3. The pick conversion is NOT oblateness-free — settled as Q7.** Q2 held all oblateness work
and Q3 held `starRenderer` on the strength of it,
on the reasoning that no converting renderer would meet a flattened body. That is true of
`texturedBodyRenderer` (every textured body passes oblateness 0) but **false of the pick**:
`starSpheresLayer.ts:178` passes `oblateness: star.oblateness` into `drawFlooredSpherePick`, and
six famous stars carry a non-zero value (up to 0.35 on Achernar).

The mechanism is exactly the one Q3 used to hold `starRenderer`. `composeBodyMvp` scales the
polar axis by `radiusMpc·(1 − oblateness)`, so the frame in which the body is the unit sphere
has its z divided by `radiusMpc·(1 − oblateness)`. `camPosLocal` divides **all three** axes by
`radiusMpc`, so for Achernar the ray origin's z is wrong by `1/(1 − 0.35)` — 54% along the polar
axis. The result is not a slightly-wrong ellipse but a badly-wrong one, and because it is the
**pick** the failure is silent: the visual star still renders correctly through the mesh
`starRenderer`, while clicks near its limb resolve against a shape that is nowhere on screen.

Three ways out, and the grill's own reasoning rules out two of them:

- **Branch the pick on oblateness** (analytic for round bodies, mesh for flattened ones) is
  what Q3 explicitly named "the trap this whole refactor-ground pass exists to catch".
- **Convert anyway and accept the wrong ellipse** is a silent regression on six bodies.
- **Give `camPosLocal` an optional `oblateness` parameter** (default 0, so the four existing
  callers are byte-identical) and divide z by `1 − oblateness`. One line in one pure util, one
  test, one extra argument at the single call site in `drawFlooredSpherePick` — which already
  receives `oblateness` today.

**Decided: the third** (Q7). It is a _correctness precondition of the decided scope_, not the
deferred oblateness feature: nothing is flattened, `starRenderer` is untouched, no ellipsoid
normal appears, the atmosphere shell's scalar `bottomRadius` is not reopened, and no `*Local`
family rename happens. It rides the prep PR as the second ground-preparation item, alongside
`lib/analyticSphere.wesl` — see "Ground preparation" above for the contract.

Consequence to record: once this lands, the deferred "convert `starRenderer` + flatten Saturn
and Jupiter" backlog item is **no longer gated on the frame fix** — the frame fix will already
exist. Its backlog entry must be written against that state.

## Deferred to backlog

Each becomes a `docs/backlog/2026-07-28-*.md` detail file with a terse `BACKLOG.md` index line.

- **`starRenderer` conversion + Saturn/Jupiter flattening** — one item, not two, because
  neither can happen without the `camPosLocal` frame fix. Reopens the atmosphere shell's scalar
  `bottomRadius`: an oblate body against a spherical shell puts a 10% radius mismatch at the
  poles, which is this same limb seam at fifty times the scale, workable only by flattening the
  shell proxy by the same factor.
- **In-atmosphere haze** — the shell cannot render over the disc when the camera is inside it,
  because a proxy shell has no geometry in front of the planet. Needs a full-screen pass, which
  is the first half of Hillaire's aerial-perspective froxel.
- **`starRenderer`'s single-uniform-buffer same-frame race.**
- **Analytic equirect uv degrades mip quality at the poles** — `v = asin(z)/π` has unbounded
  derivative there. Inherent to the approach, not fixable with the wrap trick.
- **`planetRenderer`'s `MAX_PLANETS = 24` cap.**
