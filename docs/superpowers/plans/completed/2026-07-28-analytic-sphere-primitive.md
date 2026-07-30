# Analytic sphere primitive for body rendering

**Complete 2026-07-30**, shipped across PRs #516 (prep), #520 (pick), #523 (textured body). Four
places the plan disagreed with the code, kept as its own error record:

1. Tasks 1.1 and 1.2 landed as ONE commit — `drawSphere` has exactly one call site, so a required `camPosLocal` field could not typecheck across the split.
2. Task 1.3's stated `frag_depth` failure direction was backwards: with front faces culled the proxy depth sits BEHIND the true surface by up to ~2 body radii, not 5% in front of it.
3. Task 2.3's claim that `sphereTessellation.ts` still cited `inscribedSphereRadiusFactor` was stale — #512 had removed it. The real defect was a dangling link to a deleted backlog file.
4. Task 3.2's pole-mip mechanism was wrong: `v = asin(cos θ)/π + 0.5 = 1 − θ/π` is exactly linear in colatitude, so the divergent coordinate is `u`, not `v`.

**Spec:** [`docs/superpowers/specs/2026-07-28-analytic-sphere-primitive.md`](../specs/2026-07-28-analytic-sphere-primitive.md)
**Grill:** [`docs/grill-sessions/analytic-sphere-primitive-2026-07-28.md`](../../grill-sessions/analytic-sphere-primitive-2026-07-28.md)
**Spike (proven, visually confirmed):** commit `e4bd0dbb`, gated behind `?impostor`.

For agentic workers: REQUIRED SUB-SKILL `superpowers:subagent-driven-development`, and load the
`wesl-shaders` skill before touching any `.wesl` file. Each task ends with its own scoped
commit.

## Goal

Replace the tessellated 48×24 silhouette with a ray-traced analytic sphere on
`texturedBodyRenderer` and `bodyPickRenderer`, so the drawn edge is pixel-exact and coincides
with the analytic radius the atmosphere shell already tests against. Closes the transparent
limb seam by construction. `earthRenderer`, `starRenderer` and `planetRenderer` stay on the
mesh. No oblateness feature work — no ellipsoid normals, no flattening Saturn or Jupiter, no
reopening the atmosphere shell's scalar `bottomRadius`. The one exception is `camPosLocal`'s
optional `oblateness` parameter (Q7), a correctness precondition the pick conversion forces,
not the deferred feature.

## Packaging — three PRs, in this order

| PR            | contents                                                                                                                                                                                              | based on             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **1 — prep**  | Phase 0. The `camPosLocal` oblateness parameter (Q7) and the `lib/analyticSphere.wesl` extraction — no behaviour change to any existing caller — plus this spec, its grill transcript, and this plan. | main                 |
| **2 — pick**  | Phase 1. `bodyPickRenderer` goes analytic, using the `camPosLocal` parameter PR 1 already landed. Nothing is deleted.                                                                                 | main, after 1 merges |
| **3 — adopt** | Phases 2–3. `texturedBodyRenderer` adopts it, the mesh shading path is deleted, closing tasks.                                                                                                        | main, after 2 merges |

**Prep and feature are separate diffs, always** — PR 1 never carries a feature commit.

**Why pick before adopt.** PR 3 deletes the fallback, so it is the highest-risk merge; PR 2
exercises the shared lib in a second consumer and puts `frag_depth` on iOS **while the mesh path
still exists everywhere**. The intervening state on main (exact pick silhouette, 48-gon visual)
is the benign direction of the mismatch: a hairline ring just outside the drawn planet that
responds to clicks, versus PR-3-first's hairline that looks like the planet and does not.

Open a draft PR when the first task of each lands.

## Decided: `camPosLocal` takes the oblateness parameter (Q7)

`bodyPickRenderer` is one renderer serving every body type. `starSpheresLayer.ts:178` passes
`oblateness: star.oblateness` into `drawFlooredSpherePick`, and six famous stars carry a
non-zero value (0.35 on Achernar), so converting the pick to analytic (Q5) meets a flattened
body regardless of `starRenderer` staying on the mesh (Q3). An analytic pick sphere whose ray
origin ignores flattening is wrong by `1/(1 − oblateness)` along the polar axis — silently,
because the visual star still draws correctly through the mesh `starRenderer`. Recorded as Q7
in the grill transcript and spec correction #3, with the rejected alternatives (reverting the
pick to a finer mesh; dropping oblateness from the ray origin and accepting the wrong ellipse).

`camPosLocal` gains an optional `oblateness` parameter, default 0, so the four existing callers
are byte-identical. It is Task 0.3, ground preparation alongside the `analyticSphere.wesl`
extraction, and lands in PR 1 — not the pick PR — because it is a correction to a shared
utility, not pick-specific behaviour.

## Standing test refusal

Per the spec's Testing section and
[`docs/superpowers/conventions/testing.md`](../conventions/testing.md), **do not** add tests for:

- shader maths (ray-sphere, equirect uv, gradients, frag depth) — unreachable without a GPU; the
  mock device rasterises nothing, so a green test proves only that a string reached a stub;
- `cullMode: 'front'` or `PROXY_SCALE = 1.05` — constant restatements;
- the mesh path's deletion.

The existing `texturedBodyRenderer` tests assert layout, sampler, per-body buffers and mip
generation — none touches the shading path. **If one needs editing, stop and re-read the diff**:
that is a signal the deletion reached further than intended.

## Standing acceptance rule — every `.wesl` task

A clean `npm run build` **does not prove a shader compiles**. `?static` is build-time text
linking; the WESL linker and `tsc` both pass on WGSL that `device.createShaderModule` rejects
(the duplicate-`@builtin(position)` landmine fails only at module creation). So every task below
that touches a `.wesl` file carries its own **visual acceptance** step. That step is not
optional and not deferrable to the end of the phase.

Each visual step means: dev server running, browser console open, fly to the named body,
confirm the named appearance, and confirm **zero** `Invalid ShaderModule` /
`Invalid RenderPipeline` lines. `createShaderModuleWithDevLog` prints the real
`getCompilationInfo()` error plus the linked WGSL — error line numbers refer to the **linked**
output, not the source `.wesl`.

WESL constraints that bite (`wesl-shaders` skill): comments use **single quotes, never
backticks**; imports are one identifier per line, at the **top** of the file, rooted at the
literal `package::`; never two `@builtin(position)`-bearing structs in one linked module.

---

## Phase 0 — prep (PR 1)

### 0.1: Backlog hygiene — remove the item this work picks up

**Files:** `docs/BACKLOG.md` (modify, line 53), `docs/backlog/2026-07-24-atmosphere-limb-transparent-seam.md` (delete)

Picking up a backlog item removes it in the same change; the detail file seeded the spec and the
spec is now the source of truth. Never strike through — delete.

- [x] Delete the `**Atmosphere limb transparent seam**` index line from the Rendering section.
- [x] `rm -f docs/backlog/2026-07-24-atmosphere-limb-transparent-seam.md` (bare `rm` prompts
      interactively and hangs).
- [x] Commit alongside the spec + this plan, if they are not already committed.

### 0.2: Extract `lib/analyticSphere.wesl`

**Files:** `src/services/gpu/shaders/lib/analyticSphere.wesl` (new),
`src/services/gpu/shaders/bodies/texturedBody/impostorFragment.wesl` (modify)

**This is a pure extraction. Zero behaviour change.** The maths moves verbatim from
`impostorFragment.wesl:143-209`; only its home changes.

**Contract:**

```wgsl
struct SphereHit {
  hit: bool,
  point: vec3<f32>,
};

struct UvGradients {
  ddx: vec2<f32>,
  ddy: vec2<f32>,
};

const TEXTURE_PRIME_MERIDIAN_U: f32 = 0.5;

fn hitUnitSphere(ro: vec3<f32>, rd: vec3<f32>) -> SphereHit;
fn equirectUvFromDir(dir: vec3<f32>) -> vec2<f32>;
fn equirectUvGradients(uv: vec2<f32>) -> UvGradients;
fn fragDepthFromLocal(mvp: mat4x4<f32>, pLocal: vec3<f32>) -> f32;
```

Semantics, each already implemented in the spike — cite it, don't re-derive:

- `hitUnitSphere` — `impostorFragment.wesl:149-162`. Wraps `package::lib::util::raySphere`
  against the unit sphere at the origin. `hit` is `roots.y > 0.0`; the parameter is the near
  positive root (`select(roots.y, roots.x, roots.x > 0.0)`); on a miss it is the
  closest-approach parameter `max(dot(-ro, rd), 0.0)`. `point` is `normalize(ro + rd * t)` in
  **both** cases, so it is always unit length.
- `equirectUvFromDir` — `impostorFragment.wesl:165-168`.
- `equirectUvGradients` — `impostorFragment.wesl:170-182`. Takes the uv (it needs `uv.x` for the
  wrap trick and `uv.y` for the plain v derivative) and calls `dpdx`/`dpdy` internally.
- `fragDepthFromLocal` — `impostorFragment.wesl:205-209`. `clip = mvp * vec4(pLocal, 1.0)`,
  return `clip.z / clip.w`.

Move `TEXTURE_PRIME_MERIDIAN_U` here too (delete the copy at `impostorFragment.wesl:108`) and
carry its comment: WESL cannot import the TS constant, so this is a greppable-not-importable
mirror of `src/data/bodies/texturePrimeMeridianU.ts`.

The module header is the didactic home for the four rationales the spike currently carries in
its own header — the grazing fallback and why derivatives run before `discard`; the `(0, 1]` vs
`[0.5, 1.5)` u range being sampler-identical under `repeat`; the two-seam gradient trick; and
why `fragDepthFromLocal` applies **no** reversed-Z flip. Move that prose across rather than
rewriting it, and leave `impostorFragment.wesl`'s header pointing at the lib for the details.

- [x] No test (standing refusal — GPU-only maths).
- [x] Write `lib/analyticSphere.wesl`; one cohesive module, **not** one function per file (WESL
      resolves the last path segment as the symbol name — the `lib/math.wesl` precedent).
- [x] Repoint `impostorFragment.wesl` at it: four `import package::lib::analyticSphere::…`
      lines at the top, the inline maths deleted, the fragment body otherwise untouched.
- [x] `npm run typecheck` clean.
- [x] **Visual acceptance:** load with `?impostor`, fly to Mars and to Saturn. The bodies render
      **exactly** as they did before this task — same silhouette, same texture registration,
      no antimeridian blur line, Saturn's ring shadow unchanged. Console clean.
- [x] Commit: the two files.

### 0.3: `camPosLocal` learns about oblateness

**Files:** `src/utils/camera/camPosLocal.ts` (modify),
`tests/utils/camera/camPosLocal.test.ts` (modify)

Ground preparation item two (Q7 in the grill transcript, spec correction #3): `bodyPickRenderer`
is one renderer serving every body type, and six famous stars carry non-zero oblateness (up to
0.35 on Achernar), so the pick conversion in Phase 1 needs an oblateness-aware ray origin
regardless of `starRenderer` staying on the mesh. This task carries no visible behaviour change
on its own — nothing calls the new parameter yet — which is why it rides the prep PR alongside
the `analyticSphere.wesl` extraction rather than Phase 1.

**Signature:**

```ts
export function camPosLocal(
  camPosMpc: Readonly<Vec3>,
  bodyPosMpc: Readonly<Vec3>,
  radiusMpc: number,
  orientation: Readonly<Mat3>,
  oblateness?: number, // defaults to 0
): Vec3;
```

**Behaviour:** unchanged for `oblateness === 0`. Otherwise the local z component is additionally
divided by `1 − oblateness`, because `composeBodyMvp` scales the polar (model-Z) axis by
`radiusMpc·(1 − oblateness)` (`composeBodyMvp.ts:29-33`) — so the frame in which the body is the
**unit** sphere is the one this function must land in, and today it lands in a spheroid frame
instead. The header must say that, and say that this is the frame an analytic ray-sphere test
requires; a Lambert/Minnaert **direction** consumer never noticed because it renormalizes.

- [x] Add the test `leaves the local vector unchanged for a spherical body` — a hand-computed
      expectation, oblateness omitted, asserting the existing result is byte-identical.
- [x] Add the test `divides the polar component by 1 − oblateness` — hand-computed, e.g.
      oblateness 0.35 with an on-axis camera, asserting z is `1/0.65` times the spherical result
      while x and y are untouched. Compute the expectation on paper, **never** by calling the
      function (no mirror tests).
- [x] Implement.
- [x] `npm test -- camPosLocal` green; the four existing call sites are unedited and unchanged.
- [x] Commit.

### 0.4: Prep PR

- [x] `npm test`, `npm run typecheck`, `npm run build` — all green.
- [x] `npm run format` on touched files only.
- [x] Open the PR with `--base main`. Merge before starting Phase 1.

---

## Phase 1 — the pick goes analytic (PR 2)

Depends on PR 1 having merged: the `camPosLocal` oblateness parameter (Task 0.3) already exists
by the time this phase starts.

### 1.1: `SpherePickUniforms` grows `camPosLocal` into its padding

**Files:** `src/services/gpu/shaders/bodies/spherePick.wesl` (modify),
`src/services/gpu/renderers/bodies/bodyPickRenderer.ts` (modify),
`src/@types/rendering/BodyPickRenderer.d.ts` (modify),
`tests/services/gpu/shaders/sphereUniforms.test.ts` (modify)

**Byte layout — the struct stays 80 bytes:**

```
offset  0..63  mvp          mat4x4<f32>   column-major, 64 B
offset 64..75  camPosLocal  vec3<f32>     16-byte aligned at 64
offset 76..79  packedId     u32           fills the vec3's trailing slot — a REAL field
total: 80
```

CPU scratch: `f32[0..15] = mvp`, `f32[16..18] = camPosLocal`, `u32[19] = packedId`.
`SPHERE_UNIFORM_BYTES`, the dynamic-offset slot stride, `minBindingSize` and `MAX_SPHERE_DRAWS`
are **unchanged** — that is the point of the pad-slot trick
(`RingUniforms.planetRadiusRatio` is the precedent, `lib/sphere.wesl:237-243`).

**Type:**

```ts
export type BodySpherePickArgs = {
  readonly mvp: Float32Array;
  /** Camera in the body's local frame, in FLOORED-pick-radius units — the ray origin. */
  readonly camPosLocal: Readonly<Vec3>;
  readonly packedId: number;
};
```

**Landed as ONE commit with 1.2.** `drawSphere` has exactly one call site
(`drawFlooredSpherePick.ts:74`), so a required `camPosLocal` breaks `npm run typecheck` until
1.2 supplies it; the only ways to split were a throwaway placeholder or an optional field, both
worse. Bisectability is preserved where it matters — the merged commit changes no behaviour at
all (the uniform is bound and unread) and the geometry change is still its own commit (1.3).

- [x] Add the test `SpherePickUniforms byte offsets` asserting the scratch mirror: mvp at f32
      0..15, camPosLocal at f32 16..18, packedId at u32 word 19, total 80 bytes. This is the
      WGSL/TS layout-parity keep-rule — the failure mode is a silently dropped iOS frame, not a
      wrong pixel.
- [x] Widen the WESL struct and the TS scratch/type. `SPHERE_PACKED_ID_U32_INDEX` moves 16 → 19.
- [x] The shader is otherwise untouched **in this task** — `camPosLocal` is bound and unread, so
      the pick behaves exactly as before. Splitting the layout change from the geometry change
      keeps each bisectable.
- [x] `npm test -- sphereUniforms bodyPickRenderer` green; `npm run typecheck` clean.
- [x] **Visual acceptance:** picking still works — hover and click Mars, the Moon, and a Moon
      overlapping Earth; the InfoCard names the right body each time. Console clean.
- [x] Commit.

### 1.2: `drawFlooredSpherePick` composes the ray origin

**Files:** `src/services/engine/helpers/drawFlooredSpherePick.ts` (modify)

The one funnel all four sphere-pick layers pass through, and it already holds every input.
Compute `camPosLocal(args.camPosMpc, args.positionMpc, pickRadiusMpc, args.orientation,
args.oblateness)` from the **same** `pickRadiusMpc` local the mvp is composed with, and pass it
through.

The header gains the "why" the spec's pick section states: the floor is a CPU-side **model
radius** inflation, so in the local frame the floored sphere **is** the unit sphere — the
analytic primitive composes with it unchanged, exactly as the mesh did. No call site changes.

**Landed as ONE commit with 1.1** — see the note under 1.1 for why the split was not achievable.

- [x] No new test — the helper is a thin composition over `camPosLocal` (0.3, tested) and
      `composeBodyMvp` (tested); a test here would restate both.
- [x] Implement; update the module header.
- [x] `npm run typecheck` clean; `npm test` green.
- [x] Commit.

### 1.3: `spherePick.wesl` ray-traces the sphere

**Files:** `src/services/gpu/shaders/bodies/spherePick.wesl` (modify),
`src/services/gpu/renderers/bodies/bodyPickRenderer.ts` (modify),
`src/services/gpu/shaders/lib/analyticSphere.wesl` (modify — `PROXY_SCALE` graduates here)

**Contract:**

```wgsl
// lib/analyticSphere.wesl — gains its second consumer, so the proxy scale graduates.
const PROXY_SCALE: f32 = 1.05;

// spherePick.wesl
struct SpherePickVSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) localPos: vec3<f32>,
};

struct PickFSOut {
  @location(0) id: vec4<u32>,
  @builtin(frag_depth) depth: f32,
};
```

`vs` inflates the mesh position by `PROXY_SCALE` and forwards it. `fsPick` forms
`rd = normalize(in.localPos − u.camPosLocal)`, calls `hitUnitSphere`, **discards on a miss**
(no derivatives are needed here — the pick samples nothing), and emits
`vec4<u32>(u.packedId, 0u, 0u, 0u)` plus `fragDepthFromLocal(u.mvp, hit.point)`.

Renderer: `cullMode` `'back'` → `'front'`. Nothing else about the sphere pipeline changes.

**The three ways this breaks, in order of how quietly:**

1. **Missing `frag_depth`.** The fragment keeps the proxy's interpolated depth — 5% too near,
   far hemisphere — and depth-tested nearest-wins occlusion silently breaks. **The Moon in front
   of Earth is the acceptance case, and it must be tested explicitly.**
2. **`cullMode` left at `'back'`.** The body's pick vanishes the moment the camera crosses
   inside the 1.05 shell.
3. **A second `@builtin(position)`-bearing struct** in this module — build and linker both pass,
   `createShaderModule` rejects at runtime. There is exactly one; keep it that way.

`PROXY_SCALE` graduating to the lib on its **second** consumer is the promotion criterion
`lib/util.wesl`'s header states, applied rather than pre-empted. `PROXY_SCALE · cos(3.75°) =
1.0478 > 1.0`, so the proxy strictly circumscribes; the fragment discards outside the unit
sphere, so the effective pick silhouette is exactly the model radius — the 5% never reaches the
target.

- [x] No test (standing refusal).
- [x] Implement the shader + the cull-mode flip; move `PROXY_SCALE` into the lib and import it
      from `spherePick.wesl` (leave `impostorVertex.wesl`'s local copy alone — Task 2.2 repoints
      it, and touching it here would put a feature edit in the wrong PR).
- [x] `npm test -- bodyPickRenderer` green; `npm run typecheck` clean.
- [x] **Visual acceptance (the pick is invisible — use the debug pick view):** click precisely on
      the outermost limb pixel of Mars at close approach and confirm it selects; click one pixel
      outside and confirm it does not. Then **the occlusion case**: frame the Moon transiting
      Earth and confirm clicking the Moon selects the Moon, not Earth. Then a far-edge planet
      that projects to ~2 px, confirming `minPickRadiusMpc`'s floor still gives it a clickable
      disc. Console clean.
- [x] Commit.

### 1.4: iOS check — `frag_depth` on the pick pass

**Files:** none (verification).

Not yet the gate (nothing is deleted in this PR), but the cheap early read on the riskiest
primitive. `frag_depth` written alongside an `r32uint` colour target is the specific thing to
confirm.

- [x] `SKYMAP_HTTPS=1 npm run dev`, open the LAN HTTPS URL on an iPhone or iPad
      (`vite.config.ts:9-51`; tap through the mkcert warning).
- [x] Confirm the scene **presents at all** — the silent failure mode is the whole frame being
      dropped by a shared-encoder validation error while the loop ticks and the UI updates.
- [x] Tap a planet and confirm the InfoCard opens with the right body.
- [ ] Record the result (device + iOS version) in the PR description. (author-confirmed on iOS;
      model/version not captured)

### 1.5: Pick PR

- [x] `npm test`, `npm run typecheck`, `npm run build` — all green.
- [x] `npm run format` on touched files only.
- [x] Request code review covering the uniform layout parity and the `frag_depth` occlusion path.
- [x] Merge (`gh api ... PUT /merge`, never `gh pr merge --delete-branch` from a worktree).

---

## Phase 2 — the textured body adopts it, the mesh path goes (PR 3)

### 2.1: Delete the mesh shading path and the `?impostor` gate

**Files:** `src/services/gpu/shaders/bodies/texturedBody/{vertex,fragment,io}.wesl` (delete),
`src/services/gpu/renderers/bodies/texturedBodyRenderer.ts` (modify)

The analytic path becomes the only path: one shader-module pair, `cullMode: 'front'`
unconditionally, no `hasUrlGate` import, no pipeline-label branch. The renderer's module header
loses its SPIKE paragraph (`texturedBodyRenderer.ts:276-299`) and gains a short, timeless
paragraph on the proxy + analytic sphere — comments are timeless and terse, no history notes.

Everything else in the renderer is untouched: `UNIFORM_BUFFER_SIZE`, `KIND_CFG`, the
bind-group layout, the sampler, the per-body buffer/bind-group map, `setMap`,
`setPlaceholderMap`, `clearMap`, `hasMap`, `setRingTexture`, `draw`, `destroy`.

- [x] No test (standing refusal). Existing `texturedBodyRenderer` tests must pass **unedited**.
- [x] Delete the three mesh `.wesl` files; drop the gate and the two `?static` imports for them.
- [x] `npm test -- texturedBodyRenderer` green; `npm run typecheck`; `npm run build`.
- [x] **Visual acceptance, no URL gate now:** Mars at close approach shows a smooth limb and
      **no transparent seam** against its atmosphere shell — that is the feature. Then Saturn
      (ring shadow on the planet, ring in front of the disc), the Moon (normal-mapped craters at
      the terminator), and a body mid-load (placeholder texture, still a smooth sphere). Console
      clean.
- [x] Commit.

### 2.2: Rename the impostor trio to the canonical names

**Files:** `src/services/gpu/shaders/bodies/texturedBody/impostor{Vertex,Fragment,Io}.wesl` →
`{vertex,fragment,io}.wesl`, `src/services/gpu/renderers/bodies/texturedBodyRenderer.ts` (modify)

**"Impostor" already means something else in this codebase** — billboard impostors for galaxies
and the Milky Way (`wireImpostorSubsystems.ts`, `galaxyImpostorBaseline.test.ts`,
`lib/focusUniforms.wesl`). A ray-traced sphere is the opposite technique. Leaving the name
plants a permanent collision, and a rename that stops half-way is worse than either end state.

**`npm run move-files` does NOT cover this.** It rewrites relative imports in `.ts`/`.tsx` via
ts-morph; `.wesl` files are moved by hand, and neither the `?static` import literals in TS nor
the `package::bodies::texturedBody::…` paths inside the `.wesl` files are rewritten for you.

- [x] `git mv` the three files.
- [x] Update the two `?static` import literals in `texturedBodyRenderer.ts` and the shader-module
      labels (`texturedBody.vertex` / `texturedBody.fragment`).
- [x] Update the `package::bodies::texturedBody::impostorIo::ImpostorVSOut` imports inside the
      renamed vertex + fragment; rename the struct `ImpostorVSOut` → `TexturedBodyVSOut`.
- [x] Repoint the vertex at `package::lib::analyticSphere::PROXY_SCALE` and delete its local
      const (Task 1.3 already moved it).
- [x] Sweep the three files' comments for the word "impostor" and for SPIKE / `?impostor`
      language; the surviving prose is timeless.
- [x] `rg -n "impostor" src/services/gpu/` returns **nothing** under `bodies/`.
- [x] `npm run typecheck`; `npm run build`.
- [x] **Visual acceptance:** Mars and Saturn render identically to 2.1 — a rename that breaks a
      `?static` literal or a `package::` path fails only at `createShaderModule`. Console clean.
- [x] Commit.

### 2.3: Rewrite `sphereTessellation.ts`'s header — third time, and the last

**Files:** `src/data/bodies/sphereTessellation.ts` (modify)

The text merged in #510 and corrected in #512 is now wrong in three separate ways, and will stay
wrong if nobody touches it:

1. It names **four** renderers that must agree. Two remain (`starRenderer`, `planetRenderer`)
   plus the two analytic paths, which consume the mesh only as **proxy geometry**.
2. Its "Why 48×24 and not higher" section reasons about the **drawn silhouette's** 0.214%
   inscribed deficit. For the two converted renderers there is no such deficit: the silhouette is
   analytic and the mesh is a 1.05× proxy that is never itself visible. 0.214% is still the
   number that matters, but now only as the **floor `PROXY_SCALE` must clear**.
3. Its closing paragraph claims the atmosphere shell "derives its ground-occlusion test radius
   from these counts via `inscribedSphereRadiusFactor`". **No such symbol exists anywhere in the
   repo.** `packAtmosphereUniforms` takes `bottomRadius = planetRadiusKm / atmosphereTopKm`
   (`packAtmosphereUniforms.ts:75`) — purely physical. The shell has never tracked the
   tessellation; that mismatch **was the seam**. Delete the claim outright, do not soften it.

The load-bearing reason the constant has one home also changes: it is no longer "the pick must
match the drawn silhouette" (they now match by construction), it is "the two remaining mesh
renderers must agree, and both proxies must stay coarse enough to be cheap and fine enough that
`PROXY_SCALE` clears their deficit".

- [x] No test (constant restatement).
- [x] Rewrite the header against the post-feature architecture; the values stay 48 and 24.
- [x] `npm run typecheck`.
- [x] Commit.

---

## Phase 3 — closing (PR 3, before merge)

### 3.1: iOS verification — THE GATE

**Files:** none (verification). **Blocking. PR 3 does not merge until this passes.**

PR 3 deletes the mesh fallback, so the analytic path must be confirmed on iOS/WebKit **first**.
WebKit is stricter than Tint and the failure is silent: all HDR passes share one command
encoder, so an invalid pipeline makes `encoder.finish()` produce an invalid command buffer and
`queue.submit()` drops the **entire** frame. The loop ticks, the camera moves, the React UI
updates, and nothing ever presents — no thrown error, no console entry unless
`createShaderModuleWithDevLog` catches it.

Four things a stricter implementation could reject, all of them new to this path:

- `@builtin(frag_depth)` written from a fragment that also writes colour;
- `textureSampleGrad` with hand-computed gradients;
- `dpdx`/`dpdy` taken **before** a `discard` in the same function;
- a `bool` field in a function-scope struct (`SphereHit`). Legal WGSL — bool is only barred from
  host-shareable types — but it is the least-exercised of the four. If WebKit rejects it, encode
  the flag as an `f32` and note it in the lib header.

- [x] `SKYMAP_HTTPS=1 npm run dev`; open the LAN HTTPS URL on a real iPhone **and** a real iPad
      if both are available (`vite.config.ts:9-51`).
- [x] Confirm the scene presents and the camera responds — **this is the whole point of the
      gate**; a blank canvas with a working UI is the exact silent-failure signature.
- [x] Fly to Mars: smooth limb, no transparent seam, correctly registered texture, no
      antimeridian blur line.
- [x] Fly to Saturn (ring shadow) and the Moon (normal-mapped terminator).
- [x] Tap to pick a planet and confirm the right body resolves.
- [x] If anything fails: **do not merge.** Diagnose via `createShaderModuleWithDevLog`'s output
      and fix on the branch. Reverting to a `?mesh` fallback is Option C, which Q6 rejected —
      raise it with the user rather than reinstating it unilaterally.
- [ ] Record device + iOS version in the PR description. (author-confirmed on iOS; model/version
      not captured)

### 3.2: File the deferred items as backlog entries

**Files:** `docs/BACKLOG.md` (modify), five new `docs/backlog/2026-07-28-*.md` files

From the grill's "Deferred to backlog" section. **Index lines stay very short** — title +
readiness tag + one terse clause + the `→ [details]` link; everything else goes in the detail
file, never inline.

| slug                                        | tag            | note for the detail file                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `star-renderer-analytic-plus-oblate-giants` | `needs-design` | ONE item, not two: `starRenderer` conversion and Saturn/Jupiter flattening. The `camPosLocal` oblateness parameter (Task 0.3) already exists by this point and this item is no longer gated on it; what remains is ellipsoid normals, `packTintedSphereUniforms`, and flattening the atmosphere shell proxy (an oblate body against a spherical shell puts a 10% radius mismatch at the poles — this same seam at fifty times the scale). |
| `in-atmosphere-haze`                        | `needs-design` | the shell cannot render over the disc from inside it; a proxy shell has no geometry in front of the planet. Needs a full-screen pass — the first half of Hillaire's aerial-perspective froxel.                                                                                                                                                                                                                                            |
| `star-renderer-uniform-buffer-race`         | `ready`        | single uniform buffer rewritten per body per frame; the documented `writeBuffer`-vs-`submit` hazard. `texturedBodyRenderer`'s own-buffer-per-body is the fix shape.                                                                                                                                                                                                                                                                       |
| `analytic-equirect-pole-mip-quality`        | `deferred`     | `v = asin(z)/π` has unbounded derivative at the poles, so the analytic uv degrades mip selection there. Inherent to the approach, **not** fixable with the wrap trick.                                                                                                                                                                                                                                                                    |
| `planet-renderer-max-planets-cap`           | `ready`        | `MAX_PLANETS = 24`.                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Correction found while filing.** The pole row's stated mechanism is wrong:
`v = asin(dir.z)/π + 0.5` equals `1 − θ/π` for colatitude θ, so its derivative is
the constant `1/π` per unit arc, poles included — `asin`'s singularity cancels
against the geometry. The divergent coordinate is `u = atan2(y, x)/TAU`, whose
gradient goes as `1/sin θ`. The conclusion (inherent to equirect, not fixable with
the wrap trick) survives; the reason does not. The detail file carries the
corrected derivation.

- [x] Write the five detail files and the five index lines (Rendering section).
      Filed under today's date, `docs/backlog/2026-07-29-*.md`. Four are new index
      lines; `star-renderer-uniform-buffer-race` was **already on the backlog** as
      "starRenderer per-instance uniforms", so that line was repointed at the new
      detail file rather than duplicated.
- [x] Commit.

### 3.3: `entanglement-radar` review pass

**Files:** none (review).

- [x] Run the `entanglement-radar` skill over the whole branch diff (house convention). Pay
      attention to: - **`lib/analyticSphere.wesl` is the single home for the sphere maths** — no consumer
      re-derives a uv, a gradient pair, or a depth from clip space locally; - **no second branch on the same discriminant** — one analytic path, not
      analytic-for-round / mesh-for-oblate anywhere (Q3 named this as the trap); - **`PROXY_SCALE` has one home** and is not restated next to the 0.214% deficit it must
      clear; - **`sphereTessellation.ts` describes exactly what it now governs** — proxy coarseness for
      four consumers, two of which no longer take their silhouette from it; - **the pick and the visual share the silhouette by construction**, not by two call sites
      reading one constant; - **`camPosLocal`'s oblateness parameter is a frame correction, not an oblateness
      feature** — nothing downstream has grown an "is this body flattened" branch.
- [x] Address findings, or record why deferred; keep the suite green.
      The equirect dir→uv mirror (`cubeSphereMesh.ts` / `earth/fragment.wesl` /
      `equirectUvFromDir`) was routed to the existing photoreal-Earth backlog item
      `docs/backlog/2026-07-19-photoreal-earth-followups.md` §2 rather than fixed here.

### 3.4: Final review + verification

**Files:** none.

- [x] `npm test` (full suite green), `npm run typecheck` (both tsconfigs), `npm run build`.
- [x] `npm run format` on touched files only.
- [x] Request code review (`superpowers:requesting-code-review`) covering the analytic-sphere
      lib, the deleted mesh path, and the pick silhouette/depth agreement.
- [x] Confirm the DoD and run `/feature-done` **before** merge — it sweeps the backlog and
      relocates the spec + plan into `specs/completed/` + `plans/completed/`, and that sweep
      rides this PR.
- [ ] Merge PR 3 (`gh api ... PUT /merge`).
