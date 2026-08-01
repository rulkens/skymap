# Orbit-trail ribbon impostor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop rasterizing a fullscreen triangle per orbit trail. Rasterize a screen-space ribbon that hugs the projected ellipse instead, keeping the fullscreen triangle as a per-instance fallback for projections the ribbon cannot bound (**superseded 2026-08-01 — see the Amendment before Task 11: the fallback is deleted, not kept; the ribbon absorbs its job via a near-plane clamp. The clamp was itself superseded the same day — see Amendment 2: the CPU computes each orbit's visible E-arc in closed form and the shader never sees a behind-camera sample**). Target: orbit-trails from **4.3 ms → < 1.5 ms real** at the `galactic-centre` scenario (39 S-star instances, fill-bound, sweep exponent 0.94). (**Corrected 2026-08-01:** the originally-quoted 7.6 ms baseline was taken on a loaded machine and is retracted as contaminated — see the ledger's CAUTION line; 4.3 ms is the honest paired-A/B figure. The `< 1.5 ms` gate is unchanged and still passes comfortably.)

**Architecture:** [The spec](../specs/2026-07-31-orbit-trail-ribbon-impostor.md) — read it first; §2.1–2.4 is the design and this plan does not restate it. **Ground preparation: see spec §3** ("none needed" — every touchpoint is growth at an existing seam). The fragment shader's conic math is **unchanged**; only which pixels invoke it changes.

**Tech Stack:** TypeScript, WESL/WGSL, Vitest, `npm run perf`.

## Global constraints

- **The fragment shader's math does not change.** `fragment.wesl`'s `Ginv` back-projection, Sampson distance, gradient minors and Newton horizon rejection are correct and load-bearing (see `composeOrbitConic`'s header for the f64 hoist that made them correct). The only edit any task makes to `fragment.wesl` is Task 2's constant move. (**Amended 2026-08-01:** hardware showed the analytic gradient minors cancel catastrophically at hugely-projected orbits — sub-pixel dotted bands. The stroke gradient is now measured with `dpdx`/`dpdy` on `r = uLen/z` and the minors machinery is deleted end-to-end; see Amendment 2. The `Ginv` back-projection, Kepler falloff and Newton rejection stand.)
- **No bind group.** The renderer's deliberate no-bind-group design (`orbitTrailRenderer.ts:93-104`) stands. Anything the ribbon vertex stage needs per-frame — including the viewport size — arrives as a per-instance vertex attribute.
- **The f64 seam is unchanged.** `orbitTrailsLayer` still feeds `view.slab.vp` (the `Float64Array`), never `view.vp`. The clip basis is composed in the same f64 pass as `Ginv` and narrowed once at return.
- **Coverage must be conservative** (spec §2): every pixel where the fragment would _keep_ a sample must lie inside the ribbon. A gap shows as a broken/speckled arc, most visibly edge-on.
- **The ribbon strip must abut exactly, never overlap.** The blend is one/one additive, so an overlapping joint double-adds light and a gapped joint drops fragments. See the Task 4 contract: every quantity is computed **per sample**, so the two quads sharing sample `i` compute that sample's two corners identically.
- Read [docs/RENDERER.md](../../RENDERER.md) before touching the renderer; `.claude/skills/wesl-shaders/SKILL.md` (user-level skill, `~/.claude/skills/wesl-shaders/`) before touching `.wesl` — **no backticks in WESL comments**, imports at the top, one identifier per `import`.
- **Shader work is not screenshot-tested** (house rule). It verifies via `npm run typecheck` / `npm run build`, the dev-mode shader compile log, and the Task 8 visual pass.
- `type` aliases never `interface`; one exported symbol per file in `src/utils/` and `src/@types/`.

## Deviations from the spec — read before Task 3

Three places where the code contradicts the spec text. All were checked against current source; each is flagged where it lands.

1. **There is no `HALF_WIDTH_PX`/`FEATHER_PX` pair.** Spec §2.2 calls them "the fragment's existing stroke constants". `fragment.wesl:72` has exactly one: `STROKE_PX: f32 = 2.5`, which serves as both the discard radius (`:155`) and the smoothstep feather range (`:176`). So the shared constant is `STROKE_PX`, and the ribbon half-width is `STROKE_PX + MARGIN_PX + sagitta`. Task 2.
2. **`bounded` is tested on the clip-w extent, not the conic discriminant — and it carries a second clause.** Spec §2.3 gives `B² − 4AC < −ε(A²+B²+C²)`, but composeOrbitConic assembles no conic coefficient form (it builds `H`, `G`, `Ginv`); the discriminant would have to be reconstructed as `Ginv^T·diag(1,1,−1)·Ginv`. The spec's own justification is the w-crossing ("exactly where ribbon samples cross `w ≤ 0`"), and that predicate is **exactly equivalent** (the projection is an ellipse iff the orbit stays strictly on one side of the `w = 0` plane) while reading straight off the clip basis this plan already adds. Second clause: a _near_-degenerate but still-bounded projection is arbitrarily large on screen, where the ribbon costs **more** than the fullscreen triangle it replaces — the spec assumed the degenerate cases were exactly the unbounded ones. Both clauses fold into one screen-extent bound. Task 3.
3. **`MARGIN_PX` cannot be a constant.** Spec §2.2 sizes it at "a few px" from a `SEGMENTS = 96` chord sagitta "< 0.5 px **for a viewport-filling orbit**". Sagitta scales with the projected radius: at 10,000 px radius (the Moon-orbit close-up regime, and a pose spec §4 asks for in the visual pass) it is ~21 px, so a constant margin leaves an 18-px coverage gap on the outside of every chord. The sagitta is therefore computed **per sample** in the vertex shader from a second difference of the neighbouring samples; `MARGIN_PX` shrinks to what it can honestly cover (f32 vertex noise, the per-vertex normal vs chord-normal mismatch). Task 4.

If the user rejects (2) or (3), stop and re-checkpoint the spec — they change the shape of Tasks 3 and 4, not just their bodies.

---

## Record layout (the cross-file contract)

> **Amendment 2 (2026-08-01):** the shipped layout is **34 floats / stride 136**, not the 40/160 below. The two gradient-minor vec4s (locations 6/7) were deleted with the analytic gradient, shifting the clip basis to locations 6..8 at bytes 80/96/112, and the visible-arc redesign appended `arc = (eStart, eSpan)` as a `float32x2` at location 9, byte 128. The three-site byte-for-byte contract (renderer attributes ↔ `OrbitInstance` ↔ pack loop) is unchanged in kind; consult `io.wesl`'s `OrbitInstance` for the authoritative shipped table.

`INSTANCE_FLOATS 28 → 40`, `INSTANCE_STRIDE 112 → 160`. Pinned in three places that must agree byte-for-byte: `orbitTrailRenderer.INSTANCE_ATTRIBUTES`, the WESL instance struct, and the layer's pack loop.

| floats | byte | `@location` | contents                                                          |
| ------ | ---- | ----------- | ----------------------------------------------------------------- |
| 0..3   | 0    | 1           | `Ginv` column 0 (`.xyz`, `.w` pad)                                |
| 4..7   | 16   | 2           | `Ginv` column 1                                                   |
| 8..11  | 32   | 3           | `Ginv` column 2                                                   |
| 12..15 | 48   | 4           | `color.rgb`, `eccentricity`                                       |
| 16..19 | 64   | 5           | `meanAnomalyRad`, `alpha`, **`viewportPx.w`**, **`viewportPx.h`** |
| 20..23 | 80   | 6           | gradient minors `M1, M2, M3`, pad                                 |
| 24..27 | 96   | 7           | gradient minors `M4, M5, M6`, pad                                 |
| 28..31 | 112  | 8           | `Cc = (clip.x, clip.y, clip.w, pad)`                              |
| 32..35 | 128  | 9           | `Ac`                                                              |
| 36..39 | 144  | 10          | `Bc`                                                              |

Floats 18/19 are today's zeroed trailing pad (`orbitTrailsLayer.ts:309-310`). They become the backing-store viewport in pixels — the ribbon converts a pixel half-width to clip via `p.w` and the viewport, and with no bind group this is the only channel. `all: f32`, `float32x4` throughout.

Clip basis, per spec §2.1: `clip(E) = Cc + cos(E)·Ac + sin(E)·Bc`. Only the **x, y and w** clip rows are carried — the same three rows `composeOrbitConic` already keeps (`composeOrbitConic.ts:149-159`, and its "Why only the x, y, w clip rows" header section); the ribbon emits `clip.z = 0`, which is inside WebGPU's `0 ≤ z ≤ w` clip volume for every `w > 0`.

---

### Task 1: Baselines and the draft PR

**Files:** none (orchestrator task — no subagent).

The measurement scaffolding is **already committed** on this branch: `cc3cdee7` (`PerfPose.clearFocus`) and `9afd0f2e` (the `galactic-centre` scenario + `clearFocus` on `milky-way-outside`/`milky-way-close`). Do not re-do it.

- [x] Open the draft PR for the branch (house convention: draft PR at execution start).
- [x] Confirm the before-baselines exist and are on this branch's build: `galactic-centre` (orbit-trails ≈ **7.6 ms real**, `hdr·NEAR0` 7.6 ms, MERGED total 43.2 ms) and `solar-system`. They are in this session's scratchpad; if the session rotated, re-take them from `HEAD` **before** any Task 2–6 commit lands, per the `perf` skill (`--url http://localhost:<your port>`, `--frames 30`).
- [x] Record both file paths in the plan's ledger so Task 7 compares like with like.

---

### Task 2: One home for the orbit-trail shader constants

**Files:**

- Create: `src/services/gpu/shaders/bodies/orbitTrail/constants.wesl`
- Create: `src/data/bodies/orbitTrailConstants.ts`
- Modify: `src/services/gpu/shaders/bodies/orbitTrail/fragment.wesl` (import `STROKE_PX` instead of declaring it)
- Test: `tests/services/gpu/shaders/orbitTrailConstants.parity.test.ts`

**Produces:**

```wgsl
// constants.wesl
const STROKE_PX: f32 = 2.5;   // moved verbatim from fragment.wesl:72, comment and all
const SEGMENTS: u32 = 96u;    // E-steps around the ribbon; 6 verts each
const MARGIN_PX: f32 = 2.0;   // f32 vertex noise + per-vertex-normal slack ONLY (see Task 4)
```

```ts
// src/data/bodies/orbitTrailConstants.ts
export const RIBBON_SEGMENTS = 96; // MUST equal SEGMENTS in orbitTrail/constants.wesl
```

`STROKE_PX` moves so the ribbon's half-width and the fragment's discard radius are one definition — a copied constant drifts silently into a coverage gap. `SEGMENTS` needs a TS twin because the renderer's `draw` vertex count is `RIBBON_SEGMENTS * 6`; `?static` linking injects no values, so a hand-mirror plus a parity test is the house pattern (`src/data/flow/flowFieldConstants.ts` ↔ `flow/constants.wesl` ↔ `tests/services/gpu/shaders/constants.parity.test.ts` — copy that test's regex and `process.cwd()` path resolution).

`STROKE_PX` and `MARGIN_PX` have no TS consumer and get no TS twin; scope the parity test to `SEGMENTS` and let its no-orphans direction name them as known shader-only.

- [x] Add the test `SEGMENTS in orbitTrail/constants.wesl equals RIBBON_SEGMENTS` — the mismatch is invisible to the compiler and produces a partly-drawn or garbage-cornered ribbon on hardware.
- [x] Create `constants.wesl`; delete `STROKE_PX` from `fragment.wesl` and import it (one identifier per import line, at the top of the file).
- [x] `npm test -- orbitTrailConstants` → passes. `npm run build` → the fragment still links (a broken import fails at `createShaderModule`, not at build — check the dev console too, or the linked output via `createShaderModuleWithDevLog`).
- [x] Commit.

---

### Task 3: `composeOrbitConic` returns the clip basis and the ribbon verdict

**Files:**

- Modify: `src/utils/camera/composeOrbitConic.ts`
- Test: `tests/utils/camera/composeOrbitConic.test.ts`

**Produces:**

```ts
export function composeOrbitConic(/* unchanged parameters */): {
  ginv: Float32Array; // unchanged
  minorS: Float32Array; // unchanged
  minorT: Float32Array; // unchanged
  /** (Cc, Ac, Bc), each a length-4 padded (clip.x, clip.y, clip.w, 0) — see the record layout. */
  clipBasis: readonly [Float32Array, Float32Array, Float32Array];
  /** true ⇒ the ribbon impostor bounds this projection; false ⇒ the fullscreen fallback. */
  ribbonEligible: boolean;
};
```

The three clip columns already exist in f64 as `cS`, `cT`, `cC` (`composeOrbitConic.ts:157-159`) — `Ac = cS`, `Bc = cT`, `Cc = cC`. Narrow them at the same return boundary as the minors. Clip-space magnitudes are O(1), so f32 is safe here (spec §2.1); do **not** rescale them (they must stay consistent with each other, and unlike `Ginv` nothing downstream is scale-invariant — the ribbon divides by `p.w`).

`ribbonEligible` is a two-clause f64 predicate on those same columns, computed **before** narrowing. Named constants with the derivation in the docblock:

```
R      = hypot(Ac.w, Bc.w)                       // clip-w swing around the centre
wMin   = Cc.w - R                                // the orbit's minimum clip-w
extent = (|Cc.xy| + |Ac.xy| + |Bc.xy|) / wMin    // conservative NDC half-extent bound

ribbonEligible ⇔ wMin > 0 ∧ extent ≤ RIBBON_MAX_EXTENT_NDC      (RIBBON_MAX_EXTENT_NDC = 20)
```

- `wMin > 0` is the bounded/unbounded test (deviation 2 above): `clip.w(E) = Cc.w + cos(E)·Ac.w + sin(E)·Bc.w` sweeps `[Cc.w − R, Cc.w + R]`, so no sign change ⇔ the projection is an ellipse. It also rejects the whole-orbit-behind-camera case (`Cc.w < 0`), which the fullscreen path already discards correctly at `q.z <= 0`.
- The extent clause subsumes the spec's relative-ε: as the orbit approaches the camera plane `wMin → 0⁺` and `extent → ∞`, so the near-parabolic band falls back **before** f64 noise can flip the sign test. It also caps the ribbon's own fill cost: past ~18,000 px projected radius the widened ribbon rasterizes more pixels than the fullscreen triangle, and 20 NDC units keeps a 4K viewport comfortably inside that.

Everything about `ginv`/`minorS`/`minorT` — the f64 hoist, the rescale, the minor derivation — is untouched. Do not reorder the rescale loop.

- [x] Add the test `the clip basis reprojects sample orbit points onto their projected pixels` — reuse the existing fixture's independent forward projection (`projectToPixel`, `composeOrbitConic.test.ts:45-56`): for several `E`, `Cc + cos(E)·Ac + sin(E)·Bc` divided through by its `w` and mapped NDC → pixel must equal `projectToPixel(C + cos(E)·A + sin(E)·B)`. Not a mirror — the expectation comes from the ordinary projection pipeline, not from the basis under test.
- [ ] Add the test `a far view of an orbit is ribbon-eligible` using the module's existing camera fixture.
- [ ] Add the test `a camera in the orbit plane is not ribbon-eligible` — reuse the edge-on Earth-zoom pose already built at `composeOrbitConic.test.ts:155-171`, the pose where the projection is genuinely a hyperbola.
- [ ] Add the test `an orbit approaching the camera plane falls back before the sign test can flip` — a pose with `wMin` a small positive fraction of `Cc.w`; asserts the extent clause fires while the bounded clause still says "ellipse". This is the clause a `wMin > 0`-only implementation fails.
- [ ] Implement; document both clauses and both constants in the module header (budget: header ≤ 10 lines — put the derivation beside the code, not in the header).
- [x] `npm test -- composeOrbitConic` → passes, **including the pre-existing gradient-minor regression test** (it must be untouched and still green).
- [x] `npm run typecheck` — the layer destructures a subset of the return, so it still compiles; if `vi.mock`'s factory in `tests/services/engine/frame/passes/orbitTrailsLayer.test.ts` type-checks against the real signature, add the two new fields to that mock **in this task** (Task 6 rewrites it properly).
- [x] Commit.

> **Amendment (2026-08-01):** `ribbonEligible` and `RIBBON_MAX_EXTENT_NDC`, added by this task, are removed by Task 12 — the near-plane clamp (Task 11) makes every projection ribbon-safe, so the verdict this task introduces becomes dead weight rather than a permanent classifier. The three eligibility tests this task adds are deleted in Task 12; `the clip basis reprojects sample orbit points onto their projected pixels` and the gradient-minor regression test are not.

---

### Task 4: The ribbon vertex stage

**Files:**

- Modify: `src/services/gpu/shaders/bodies/orbitTrail/io.wesl` (add the shared instance struct)
- Modify: `src/services/gpu/shaders/bodies/orbitTrail/vertex.wesl` (add a second entry point)

**Produces:** one vertex module with **two** entry points, both returning the unchanged `VSOut`:

```wgsl
// io.wesl — the per-instance record, declared ONCE so the two entry points cannot drift.
struct OrbitInstance {
  @location(1) ginv0: vec4<f32>,
  @location(2) ginv1: vec4<f32>,
  @location(3) ginv2: vec4<f32>,
  @location(4) params: vec4<f32>,   // color.rgb, eccentricity
  @location(5) phase: vec4<f32>,    // meanAnomalyRad, alpha, viewportPx.w, viewportPx.h
  @location(6) minorS: vec4<f32>,
  @location(7) minorT: vec4<f32>,
  @location(8) cc: vec4<f32>,       // clip basis: centre  (x, y, w, pad)
  @location(9) ac: vec4<f32>,       // clip basis: semi-major
  @location(10) bc: vec4<f32>,      // clip basis: semi-minor
};

// vertex.wesl
@vertex fn vs(@builtin(vertex_index) vid: u32, inst: OrbitInstance) -> VSOut;        // fullscreen fallback, 3 verts
@vertex fn vsRibbon(@builtin(vertex_index) vid: u32, inst: OrbitInstance) -> VSOut;  // ribbon, SEGMENTS*6 verts
```

`vs` keeps its current body verbatim (the oversized triangle) — only its parameter list collapses into `inst`. Both forward the same varyings; the fragment is unaware which stage ran. `VSOut` does not change.

> If wesl-plugin rejects a struct-typed vertex input, fall back to duplicating the ten parameters across both entry points and say so in a comment — but try the struct first: keeping one declaration is exactly what `io.wesl`'s header says the file is for.

**`vsRibbon` contract.** `vid → (segment, corner)` with `segment = vid / 6u`, `corner = vid % 6u`; the quad for segment `i` spans samples `i` and `i+1`, and sample `SEGMENTS` wraps to `0` so the strip closes. Winding is irrelevant (`cullMode: 'none'`).

Every quantity is computed **per sample index**, never per segment:

```
E(i)   = 2π · i / SEGMENTS                      // E-parametrization clusters samples at periapsis
p(i)   = cc.xyw + cos(E)·ac.xyw + sin(E)·bc.xyw // (clip.x, clip.y, clip.w)
px(i)  = (p.xy / p.w) * 0.5 * viewportPx        // isotropic pixel space
tangent = normalize(px(i+1) - px(i-1))          // perp of this is the sample normal
sag     = |dot(0.5*(px(i-1) + px(i+1)) - px(i), normal)|   // second-difference chord bound
half    = STROKE_PX + MARGIN_PX + sag
outPx   = px(i) + side * half * normal          // side = ±1 from the corner index
out.clip = vec4(outPx / (0.5 * viewportPx) * p.w, 0.0, p.w)
```

Why this exact shape, in one line each (put these in the file, not more):

- **Per-sample, not per-segment**: the two quads sharing sample `i` then emit _identical_ corners, so the strip abuts exactly — no double-add under the additive blend, no sub-pixel notch at the joint. A per-segment tangent or per-segment sagitta breaks that.
- **`sag` is the second difference**, so a wide orbit widens its own ribbon; a constant margin cannot (deviation 3). It over-covers a circular arc by ~4×, which is the conservative direction.
- **The chord tangent** (samples `i±1`) needs no projective derivative and is the direction the strip's edges actually run in.
- **`clip.z = 0`** — the pipeline is depthless; `0 ≤ 0 ≤ w` is inside the clip volume for every `w > 0`, and `ribbonEligible` guarantees `w > 0` at every sample.
- Guard `normalize` with `max(length(...), 1e-20)`, as the fragment already does for its gradients.

**No test file.** WESL does not run under Vitest and a TS re-implementation of this math would be a mirror. Verification is `npm run typecheck` + `npm run build`, the dev-mode shader compile log at first draw, and Task 8.

- [x] Add `OrbitInstance` to `io.wesl`; repoint `vs` at it.
- [x] Add `vsRibbon` per the contract above, importing `SEGMENTS`, `STROKE_PX` and `MARGIN_PX` from `constants.wesl` (one identifier per import, at the top).
- [x] `npm run build` clean; load the dev server and confirm no `Invalid ShaderModule` cascade (the trails draw at the solar-system pose — that exercises `vs`; `vsRibbon` is not exercised until Task 5+6 land, so a compile error there surfaces at module creation, not at draw).
- [x] Commit.

---

### Task 5: Two pipelines, one fragment module, one partitioned draw

**Files:**

- Modify: `src/services/gpu/renderers/bodies/orbitTrailRenderer.ts`
- Modify: `src/@types/rendering/OrbitTrailRenderer.d.ts`
- Test: `tests/services/gpu/renderers/bodies/orbitTrailRenderer.test.ts`

**Produces:**

```ts
export const INSTANCE_FLOATS = 40;
export const INSTANCE_STRIDE = 160;

// OrbitTrailRenderer.d.ts
draw(
  pass: GPURenderPassEncoder,
  instances: Float32Array,
  ribbonCount: number,
  fallbackCount: number,
): void;
```

Two pipelines built from the **same** `fsModule` and the **same** vertex module (different `entryPoint`), sharing one `INSTANCE_ATTRIBUTES` vertex-buffer layout and one instance VBO. `structureMarkerRenderer.ts:250-330` is the in-repo precedent for several pipelines over one vertex-buffer layout and one module with multiple entry points. Everything else about the pipeline profile — empty explicit layout, `ADDITIVE_BLEND`, no `depthStencil`, `cullMode: 'none'` — is identical for both.

**The partition contract** (the layer's half is Task 6): ribbon records occupy the **front** of `instances`, fallback records the **back** of the same array, with unwritten slots in the middle. So with `slots = instances.length / INSTANCE_FLOATS`:

- ribbon draw: `pass.draw(RIBBON_SEGMENTS * 6, ribbonCount, 0, 0)`
- fallback draw: `pass.draw(3, fallbackCount, 0, slots - fallbackCount)` — the fourth argument is `firstInstance`, which is what lets both partitions live in one VBO with no compaction pass.

Each draw is skipped entirely at count 0; both zero is a whole-call no-op. The count guard generalises: throw when `ribbonCount + fallbackCount > slots` or either is negative — same reasoning as today (`orbitTrailRenderer.ts:160-168`), a caller bug must not become a silently dropped trail.

Upload: keep it to ONE `writeBuffer`. Uploading all `slots` records (60 × 160 B ≈ 9.6 kB) is simplest and covers both partitions; the middle slots are never referenced by either draw. Grow the buffer on `slots`, not on a count.

The module header's "Geometry is a fullscreen triangle" section becomes the two-path story: which path an instance takes, and that the fragment module is shared. Keep it inside the comment budget — the _why_ lives in the spec, link it.

- [x] Update the existing layout test `pins the FULL instance attribute layout` for the widened record: locations 1..10, offsets 0/16/32/48/64/80/96/**112/128/144**, `arrayStride` 160, still exactly ONE vertex buffer.
- [ ] Add the test `builds a ribbon pipeline and a fullscreen pipeline from one fragment module` — both descriptors present, `fragment.module` identical, vertex `entryPoint` `'vsRibbon'` vs `'vs'`.
- [ ] Add the test `issues the ribbon draw for the ribbon count and the fullscreen draw for the fallback count` — asserts both `draw` calls including `firstInstance`: `(RIBBON_SEGMENTS*6, r, 0, 0)` and `(3, f, 0, slots - f)`.
- [ ] Add the test `a zero count skips its own draw` — `(r>0, f=0)` issues one draw, `(r=0, f>0)` issues one draw, `(0, 0)` issues none and no `writeBuffer`.
- [ ] Add the test `counts that overrun the packed array throw` — extend the existing over-count test to the pair.
- [x] Keep the existing profile test (additive/depthless/cull-none) green for **both** pipelines.
- [x] Implement.
- [x] `npm test -- orbitTrailRenderer` → passes.
- [x] Commit.

> **Amendment (2026-08-01):** the two-pipeline / two-count `draw` this task establishes is replaced by a single pipeline and a single count in Task 12 — the fallback pipeline and every test above keyed on `fallbackCount` are removed there, not extended. Read Task 12's file list before touching this renderer again.

---

### Task 6: The layer packs the partition

**Files:**

- Modify: `src/services/engine/frame/passes/orbitTrailsLayer.ts`
- Test: `tests/services/engine/frame/passes/orbitTrailsLayer.test.ts`

The pack loop (`orbitTrailsLayer.ts:254-315`) keeps every gate it has — `CULL_PX`/`FULL_PX`, the apparent-size fade, `layerOpacity`, the per-frame re-derivation, the `sceneBodyStates` reads. Deltas only:

- destructure `clipBasis` and `ribbonEligible` from `composeOrbitConic`;
- write float 18/19 = `view.viewportPx[0]` / `[1]` (was zeroed pad);
- write the three clip-basis vec4s at floats 28..39;
- **ribbon records at `ribbonCount++` from the front; fallback records at `limit - 1 - fallbackCount++` from the back**, both into the one `staging` array (already sized `ORBITAL_ELEMENTS.length * INSTANCE_FLOATS`, so the two partitions cannot collide — the per-orbit records are disjoint by construction);
- `renderer.draw(pass, staging, ribbonCount, fallbackCount)`, called when either count is non-zero.

`staging` grows automatically with `INSTANCE_FLOATS` — no size edit. The `enabled()` gate is untouched.

- [ ] Update the existing mock of `composeOrbitConic` to return `clipBasis` + `ribbonEligible`, with distinct sentinel values per field (the existing mock's `101/102/103` idiom) so the pack offsets stay pinned.
- [ ] Add the test `packs ribbon records from the front and fallback records from the back` — mock `ribbonEligible` per call so both partitions are non-empty; assert both counts reach `draw` and that the sentinel records land at instance 0 and at instance `limit - 1`.
- [x] Add the test `the clip basis and viewport reach the packed record` — floats 28..39 carry the mocked basis, floats 18/19 carry `view.viewportPx`. (The existing assertion that floats 18/19 are zero is now wrong — replace it, don't delete the line.)
- [x] Keep every existing test green: the `view.slab.vp` seam, the moon-rides-its-parent case, the S-star region gate, the fade multiply, the null-handle no-op, the all-culled skip (which must now issue **no** draw at all, both counts zero).
- [x] Implement.
- [x] `npm test -- orbitTrailsLayer` → passes; then `npm test` whole-suite green.
- [x] Commit.

> **Amendment (2026-08-01):** the front/back partition this task builds is removed by Task 12 — every visible orbit packs into one run with one count, since `ribbonEligible` no longer exists to split on. The test `packs ribbon records from the front and fallback records from the back` is deleted there, not extended.

---

### Task 7: Perf verification — the acceptance gate

**Files:** none (orchestrator task — subagents cannot run `npm`).

Read `.claude/skills/perf/SKILL.md` first. Same flags as the Task 1 baselines, **`--url` pointed at this worktree's own dev server port**, `--frames 30` minimum. Restart or confirm HMR picked up the shader edits before trusting an "after" run.

Acceptance, from spec §4:

- `galactic-centre`: orbit-trails **< 1.5 ms real** (floor-subtracted, from 7.6), and merged `hdr·NEAR0` back near its trails-off level.
- `solar-system`: no regression beyond ~0.5 ms run-to-run noise.
- Quote MERGED numbers and floor-subtracted per-layer "real" values; never raw PER-LAYER rows.

- [x] Re-run `galactic-centre` and `solar-system`; save both to the scratchpad beside the baselines.
- [ ] If `galactic-centre` misses < 1.5 ms, re-run `--sweep` on it before changing anything: an exponent that has dropped toward 0 means the remaining cost is vertex/CPU-bound and `SEGMENTS` is the lever; an exponent still near 1 means coverage is wider than intended (suspect the sagitta term).
- [x] Record both before/after numbers in the PR description.

> **Amendment (2026-08-01):** the "log the ribbon/fallback split at the pose" diagnostic above is obsolete after Task 12 — there is no split left to log, every orbit takes the one `vsRibbon` path. Likewise `RIBBON_MAX_EXTENT_NDC`'s tuning note (ledger: "OPEN TUNING ITEM for T7") is moot; the constant it tunes is deleted. Task 7 must be **re-run against Task 12's HEAD**: the numbers already recorded in the ledger measured the fallback-present architecture (and `solar-system`, all-fallback at the time, never saw the win `galactic-centre` did) — they do not stand in for this task once Task 12 lands. Re-run the acceptance bullets above in full, and additionally confirm `solar-system` issues zero fullscreen fallback draws (see the updated DoD).

---

### Task 8: Visual pass (user)

Ask the user to look. Spec §4's list, in order — the first three are the common poses, the fourth is where a coverage gap shows first, the fifth is the fallback path:

1. Solar-system planet view — every trail present, same brightness, same tail falloff.
2. Moon orbit close-up — the large-projection regime; a constant-margin ribbon would break up here.
3. S-star cluster at Sgr A\* — 39 trails, no dropouts, no double-bright arcs at segment joints.
4. The edge-on Earth-zoom pose from `docs/backlog/2026-07-18-orbit-trail-residual-speckle.md` — thinnest ribbon. The pre-existing speckle is **out of scope** and must look neither better nor worse (the fragment math did not change); what to check is that the arc is not _broken_.
5. Camera inside an orbit — the fallback path; must render exactly as today.

> **Amendment (2026-08-01):** pose 5 above describes the fallback-present architecture. After Task 12 there is no fallback path — a camera-inside-orbit pose (the `solar-system` scenario's normal viewing regime) draws the same near-plane-clamped `vsRibbon` as every other orbit. Re-run this whole task against Task 12's HEAD with pose 5 reworded to: "Camera inside an orbit — ribbon path, near-plane-clamped; check for a visible seam or gap at the clamp boundary, and confirm the Task 10 overlay shows a ribbon hull (not a fallback wash — that pipeline no longer exists) on all 9 solar-system orbits."

**Two predicted fold artifacts to look for specifically.** Task 4's review derived both from the ribbon formula this plan mandates; the user's call (2026-07-31) was to confirm them visually before deciding a fix, so this pass is where they get judged. Both live at the two **turning points** (the ends of the projected major axis), not at arbitrary joints:

1. **Double-add pip** — the offset ribbon self-intersects wherever the projected radius of curvature `B²/A` drops below the ribbon half-width (≥ 4.5 px), so two quads cover the same stroke pixels and the one/one blend adds twice. Trigger is roughly a 15:1 projected aspect, i.e. near-edge-on. Look for a bright spot at each end of the major axis on pose 4, and on any near-edge-on planet orbit in pose 1. If it reads: the prepared fix was a third `ribbonEligible` clause routing to the fullscreen path — **no longer available after Task 12** (`ribbonEligible` is deleted); a fix at that point needs a different mechanism (e.g. clamping the offset itself to the local curvature radius) and should be re-scoped with the user rather than assumed.
2. **Cap nick** — on projections whose long axis exceeds ~8400 px the quad degenerates at the fold and under-covers the stroke cap by ~0.25 px. Look for a broken or flattened cap at the ends of the major axis on pose 2 (Moon close-up). If it reads: raise `SEGMENTS`, which shrinks the sagitta directly.

- [x] Request the visual pass on all five poses, naming the two artifacts above and where they would appear.
- [x] If a coverage gap appears, do not widen `MARGIN_PX` reflexively — identify whether it is a joint (per-segment quantity crept in), a chord (sagitta term), a fold (the two artifacts above), or (pre-Task-12 only) a classification miss. The Task 10 overlay distinguishes the last one directly.

---

### Task 9: Entanglement radar and close-out

**Files:** `docs/BACKLOG.md` if the radar surfaces a follow-up.

- [x] Run the `entanglement-radar` skill over the full branch diff. Specific things to ask it: does `ribbonEligible` braid "is an ellipse" with "is worth a ribbon" in a way that will need un-braiding later; is the front/back partition convention stated in exactly one place or restated in three; do the record layout's three sites (renderer attributes, `OrbitInstance`, pack loop) have a single named contract or three parallel comment tables.
- [x] File anything it names that is not fixed in this branch as a `docs/BACKLOG.md` line (terse index line + detail file if design-bearing).
- [ ] Run `/feature-done` against this plan; relocate plan + spec to `plans/completed/` + `specs/completed/`.

---

### Task 10: Debug overlay — see the impostor

Requested by the user during execution (2026-07-31). Executes **after Task 6** (it needs the two pipelines and the packed partition); it is not on the critical path to Task 7's perf gate.

**Files:**

- Modify: `src/@types/settings/EngineSettingsState.d.ts` (one boolean in the `debug` cluster)
- Modify: `src/data/defaults.ts`, `src/state/settings/initialState.ts`, `src/state/settings/settingsSlice.ts`, `src/state/settings/selectors.ts`
- Modify: `src/components/DebugPanel/DebugOverlaysSection.tsx`, `src/components/containers/DebugOverlaysSectionContainer.tsx`
- Modify: `src/services/gpu/shaders/bodies/orbitTrail/fragment.wesl` (two new entry points — the production `fs` body is untouched)
- Modify: `src/services/gpu/renderers/bodies/orbitTrailRenderer.ts`, `src/@types/rendering/OrbitTrailRenderer.d.ts`
- Modify: `src/services/engine/frame/passes/orbitTrailsLayer.ts`
- Test: the renderer and layer test files

**What it shows and why that.** The overlay answers the two questions this feature can fail on, which are invisible in the production render: _is the ribbon hull actually covering the stroke_ (a gap shows as a broken arc, but only if you happen to be at the pose where it breaks), and _which orbits took the fallback_ (a classification miss is a silent perf regression, not a visual one). So the overlay draws the ribbon hull as a flat translucent fill in one tint, and the fallback instances as a much dimmer full-viewport wash in a second tint — a wash is the honest picture of what a fallback instance actually rasterizes, and its presence is the signal.

**Settings.** `debug.showOrbitTrailImpostor: boolean`, default `false`, mirroring `showDiskRadiusRing` at every hop: `DEFAULT_SHOW_ORBIT_TRAIL_IMPOSTOR` in `defaults.ts`, the `initialState.debug` entry, a `setShowOrbitTrailImpostor` reducer (`settings.debug.showOrbitTrailImpostor = action.payload`, exported from the slice's action list), `selectShowOrbitTrailImpostor` in `selectors.ts`, a third checkbox row labelled "Show orbit-trail impostor" in `DebugOverlaysSection.tsx` with its prop pair, wired in the container. Extend the `debug` cluster's docblock with the same one-entry-per-flag style already there.

**Rendering.** Two new fragment entry points beside `fs`, each a constant-colour one-liner — the production fragment path must not grow a debug branch:

```wgsl
@fragment fn fsImpostorRibbon(in: VSOut) -> @location(0) vec4<f32>;    // hull tint
@fragment fn fsImpostorFallback(in: VSOut) -> @location(0) vec4<f32>;  // wash tint, much dimmer
```

Two entry points rather than one plus a varying: `VSOut` is a cross-task contract and the fragment cannot otherwise tell which vertex stage ran. Both take the unchanged `VSOut` so they pair with the existing `vsRibbon`/`vs` without touching either.

The renderer gains two debug pipelines (`vsRibbon`+`fsImpostorRibbon`, `vs`+`fsImpostorFallback`) sharing the one vertex-buffer layout and the additive/depthless profile. **Build them lazily on first enable**, not at construction — the overlay is off in production and an unused pipeline is pure init cost. `draw` takes an optional fifth parameter `showImpostor = false`; when true it issues the two debug draws with the same vertex counts and `firstInstance` offsets as the production pair, **in addition to** the production draws, so the overlay is a lens over the real geometry rather than a replacement for it.

The layer reads the selector alongside the settings it already reads and forwards the flag; `enabled()` is untouched (the overlay never forces the layer on).

- [x] Add the test `the impostor overlay draws the hull and the fallback wash only when enabled` — asserts no debug pipeline is created and no extra draw issued while the flag is false, and that enabling it adds exactly two draws with the production vertex counts and `firstInstance` offsets.
- [x] Add the test `the layer forwards the debug flag to the renderer`.
- [x] Implement; keep every existing renderer/layer test green.
- [x] `npm test -- orbitTrailRenderer orbitTrailsLayer`, `npm run build`.
- [x] Commit.

> **Amendment (2026-08-01):** `fsImpostorFallback` and its debug pipeline, added by this task, are deleted by Task 12 along with the production fallback — the overlay narrows to the one hull tint (`fsImpostorRibbon`). The settings/selector/UI chain (`showOrbitTrailImpostor` and its DebugPanel row) is untouched, since it carries one boolean with no pipeline-count knowledge.

Not in scope: a wireframe outline mode, per-orbit labels, or any overlay for the conic math itself.

---

## Amendment (2026-08-01) — the fallback is eliminated, not tolerated

USER DECISION 2026-08-01: camera-inside-orbit is the NORMAL solar-system viewing regime, not an edge case, so the fullscreen fallback is the problem, not an acceptable cost. Task 7's paired measurement already showed why: fixing the ribbon's zero-area-draw bug dropped `galactic-centre`'s MERGED total by ~29 ms — far more than orbit-trails' own line item — the working explanation being that the fallback's N additive fullscreen quads saturate tile bandwidth and inflate every other pass. `solar-system` (camera inside every orbit, all-fallback) never got that win.

The clip basis `clip(E) = Cc + cos(E)·Ac + sin(E)·Bc` is exact for every `E`, including behind-camera samples — it is `P·V` applied to the ellipse parametrization, and `w`'s sign only marks behind-camera. Only the screen-space division and the pixel widening break at `w ≤ 0`. So the fix is a near-plane clamp inside `vsRibbon` (Task 11), then wholesale deletion of the fallback machinery (Task 12) — no new instance data, no CPU math changes, the 40-float record layout untouched.

This supersedes every place above that describes the fullscreen fallback as permanent — Task 3's `ribbonEligible` verdict, Task 5/6's front/back partition, Task 8's pose 5 ("the fallback path; must render exactly as today"), and Task 10's `fsImpostorFallback` debug pipeline. Those tasks are already shipped and their text is left as-is (it was correct when written); Task 12 is where each of those surfaces gets removed. Do not re-derive or "fix" them in place — see Task 12's file list.

> **Amendment 2 (2026-08-01):** the near-plane clamp this section prescribes shipped, but on hardware it grew four rounds of follow-on fold machinery (viewport fold boxes, E-ownership discard, tangent extension) and still leaked oversized triangles at live poses. Amendment 2 (below, before the DoD) replaced the whole family: the CPU clips the visible arc in closed form and `vsRibbon` never samples behind the camera. Task 11's contract is retained as history only.

---

### Task 11: Near-plane clamping in `vsRibbon` — the ribbon absorbs the fallback's job

**Files:** Modify: `src/services/gpu/shaders/bodies/orbitTrail/vertex.wesl`

**Contract** — per-instance scale-free epsilon:

```
εw(inst) = 1e-6 · (|Cc.w| + hypot(Ac.w, Bc.w))
```

(or an equivalently scale-free form; if a different form is used, state it exactly in the WGSL comment). For a segment spanning samples `i`, `j = i+1` (each already reduced to clip `(x, y, w)`):

- **Both `w > εw`** (fully in front): behavior byte-identical to today's `ribbonSample`/`vsRibbon` — the per-sample abutting invariant (the two quads sharing sample `si` emit identical corners) holds exactly as it does now.
- **Exactly one behind** (`w ≤ εw`): slide the behind endpoint along the segment's CLIP-space chord to the `w = εw` crossing — linear interpolation, `t = (εw − w_i) / (w_j − w_i)` — then widen at the clamped point with the same pixel-width formula (offset in `clip.xy = (px / (0.5·viewport)) · w`, exact screen width at any `w > 0`). The tangent for such a boundary segment comes from the segment's own clamped screen-space chord — the existing central-difference tangent needs neighbour samples that may themselves be behind, so it cannot be reused here.
- **Both behind**: emit a degenerate quad — all six corners at one point, zero area, zero fragments.
- An orbit entirely behind the camera therefore costs zero fragments, with no CPU-side classification required.
- Seam mismatch at a clamped boundary is acceptable: the clamped endpoint's screen position is enormous and off-viewport, so hardware clipping removes it before rasterization.

Comment budget applies (module header ≤ 10 lines, comment lines ≤ half the code lines touched); the WGSL comment must record WHY per-segment clamping is allowed to break the per-sample invariant ONLY off-screen — the fragment never sees an off-screen pixel, so the invariant's purpose (no additive seam) is preserved everywhere it matters.

**Verification.** WESL does not run under Vitest, so there is no failing-test-first step. `npx vite build` must link (a broken import surfaces at `createShaderModule`, not at build — check the dev console / `createShaderModuleWithDevLog` output too). The clamp's actual effect on hardware is not independently visible after this task alone: `ribbonEligible` (Task 3) still gates the ribbon pipeline as of this task, so no camera-inside-orbit instance reaches `vsRibbon` with a `w ≤ εw` sample in production yet — that only happens once Task 12 removes the gate. Hardware confirmation of this task's clamp is therefore folded into Task 12's visual check (solar-system pose, Task 10's debug overlay, all planet/moon orbit hulls drawing as ribbons with no fallback wash and no gap at the fold).

- [ ] Implement the clamp in `ribbonSample` and/or `vsRibbon` per the contract above.
- [ ] `npm run build` clean; confirm no `Invalid ShaderModule` cascade in the dev console.
- [ ] Commit.

---

### Task 12: Delete the fallback path (growth by deletion)

**Depends on Task 11** — deleting the fallback before the ribbon can absorb inside-orbit projections would leave those orbits undrawn.

**Files:**

- Modify: `src/utils/camera/composeOrbitConic.ts` — remove `ribbonEligible`, `RIBBON_MAX_EXTENT_NDC`, and the extent computation; the return type keeps `clipBasis` unconditionally, `ginv`/`minorS`/`minorT` untouched.
- Modify: `tests/utils/camera/composeOrbitConic.test.ts` — remove the three eligibility-discrimination tests (`a far view of an orbit is ribbon-eligible`, `a camera in the orbit plane is not ribbon-eligible`, `an orbit approaching the camera plane falls back before the sign test can flip`); keep `the clip basis reprojects sample orbit points onto their projected pixels` and the gradient-minor regression test (`describe('composeOrbitConic — gradient-minor hoist at the edge-on Earth pose')`) untouched.
- Modify: `src/services/engine/frame/passes/orbitTrailsLayer.ts` — remove the front/back partition; pack every visible record front-to-back in a single counter; one `renderer.draw` call.
- Modify: `tests/services/engine/frame/passes/orbitTrailsLayer.test.ts` — remove `packs ribbon records from the front and fallback records from the back`; update `composes each visible conic from view.slab.vp and issues ONE partitioned draw` and `the clip basis and viewport reach the packed record` for the single-count draw.
- Modify: `src/services/gpu/renderers/bodies/orbitTrailRenderer.ts` — remove the fullscreen (`vs`) production pipeline and the `fsImpostorFallback` debug pipeline; `draw(pass, instances, count, showImpostor = false)` (one count).
- Modify: `src/@types/rendering/OrbitTrailRenderer.d.ts` — update `draw`'s signature and doc to match.
- Modify: `tests/services/gpu/renderers/bodies/orbitTrailRenderer.test.ts` — remove/rewrite the two-count tests (`builds a ribbon pipeline and a fullscreen pipeline from one fragment module`, `issues the ribbon draw for the ribbon count and the fullscreen draw for the fallback count`, the two-count cases of `a zero count skips its own draw`, the pair case of `counts that overrun the packed array throw`) for the one-count signature; keep the layout/profile/growth tests, narrowed to the surviving pipeline pair (production ribbon + debug ribbon).
- Modify: `src/services/gpu/shaders/bodies/orbitTrail/vertex.wesl` — delete the `vs` fullscreen entry point; rewrite the module header (the "Why a fullscreen triangle, not a projected bounding quad" section describes deleted code — replace it with the ribbon + near-plane-clamp design, ≤ 10 lines).
- Modify: `src/services/gpu/shaders/bodies/orbitTrail/io.wesl` — its header and `OrbitInstance`/`VSOut` docblocks reference `vs` and the fullscreen triangle; correct.
- Modify: `src/services/gpu/shaders/bodies/orbitTrail/fragment.wesl` — delete `fsImpostorFallback`; keep `fs` and `fsImpostorRibbon` unchanged.

**Signature after this task:**

```ts
draw(
  pass: GPURenderPassEncoder,
  instances: Float32Array,
  count: number,
  showImpostor?: boolean,
): void;
```

Not in scope: any change to the fragment's conic math, or to the debug overlay's settings/UI chain — `debug.showOrbitTrailImpostor` and its DebugPanel row (`src/components/DebugPanel/DebugOverlaysSection.tsx`, `DebugOverlaysSectionContainer.tsx`) carry one boolean with no pipeline-count knowledge and need no edit; the toggle now lenses one production pipeline instead of two.

- [x] Update the test files named above first — remove assertions for code being deleted; where a removed code path leaves a genuine behavioral claim to re-test (e.g. the single-count draw shape), write that test before the implementation changes.
- [x] Implement the deletions in dependency order: `composeOrbitConic.ts` → `orbitTrailsLayer.ts` → `orbitTrailRenderer.ts` + `.d.ts` → `vertex.wesl` → `fragment.wesl` — each step's caller stops referencing the removed symbol before the symbol goes.
- [x] Grep the branch for `ribbonEligible`, `fallbackCount`, `RIBBON_MAX_EXTENT_NDC`, and the `'vs'` entry-point string to confirm no other touchpoint was missed.
- [x] `npm test -- composeOrbitConic orbitTrailsLayer orbitTrailRenderer` → passes; then `npm test` whole-suite green.
- [x] `npm run typecheck` && `npm run build` clean.
- [x] Commit.

---

## Amendment 2 (2026-08-01) — CPU closed-form visible arc; fold geometry deleted

Task 11's in-shader near-plane clamp could not be made robust: uniform-in-E GPU sampling cannot cover unbounded near-fold projections with bounded per-segment geometry, and every hardware round (near-plane clamp → viewport fold boxes → E-ownership discard → tangent extension → a reviewed wedge-clip design, never built) was a special case forced by that mismatch. The user's live verdict — oversized triangles still tanking frame rate — triggered the redesign.

The replacement moves visibility to the CPU, in closed form. Clip-w along the orbit is a pure sinusoid, `w(E) = Cc.w + R·cos(E − φ)` with `R = hypot(Ac.w, Bc.w)`, so the in-front-of-camera portion is exactly ONE E-interval, computed in f64 in `composeOrbitConic` and returned as `arc: [eStart, eSpan]`:

- `eSpan = 0` (orbit fully behind) ⇒ the layer culls the instance on the CPU — zero vertices;
- `eSpan = TAU` ⇒ closed strip, `vsRibbon` wraps sample indices mod `SEGMENTS` (seam bit-identical);
- otherwise an open arc: neighbour indices clamp at the ends (one-sided tangents), and the near-degenerate endpoints land far off-viewport where the hardware clipper removes them.

`vsRibbon` samples only inside the arc, so a behind-camera sample cannot exist and ALL fold machinery is deleted — no clamp, no fold boxes, no E-ownership varying, no `eOwn` discard in the fragment. Alongside this, the fragment's analytic gradient minors were replaced by hardware screen-space derivatives on `r = uLen/z` (they cancelled catastrophically at hugely-projected orbits) and the minors machinery deleted end-to-end; the record layout is **34 floats / stride 136** with `arc` at location 9. Landed at `83ce420f` (minors deletion), `bce92c55` (derivative gradient), `6e2e1d84` (visible arc).

Residual accepted by the user (2026-08-01 live pass): dashed/dotted rendering on near-edge-on trails at the solar-system pose — the pre-existing fragment-numerics family (`docs/backlog/2026-07-18-orbit-trail-residual-speckle.md`), not fold geometry. Optional follow-up dials, deliberately NOT built: adaptive (curvature-weighted) sample spacing, and an interpolated-varying fragment replacing the analytic conic evaluation.

---

## Definition of Done

**Deliverable inventory**

- `src/services/gpu/shaders/bodies/orbitTrail/constants.wesl` with `STROKE_PX` (moved, not copied — `fragment.wesl` declares it nowhere), `SEGMENTS`, `MARGIN_PX`; `src/data/bodies/orbitTrailConstants.ts` exporting `RIBBON_SEGMENTS`, pinned to the WESL twin by a parity test.
- `composeOrbitConic` returns `ginv`, `clipBasis`, and the closed-form visible arc `arc: [eStart, eSpan]` — no eligibility verdict, no gradient minors (Amendment 2).
- `io.wesl` declares `OrbitInstance` once; `vertex.wesl` exposes a single `vsRibbon` entry point sampling only the CPU-clipped visible arc (Amendment 2); no `vs` fullscreen entry point remains (Task 12). `fragment.wesl`'s `fs` keeps the `Ginv` back-projection, Kepler falloff and Newton rejection; its stroke gradient is measured with `dpdx`/`dpdy` (Amendment 2).
- `orbitTrailRenderer` builds one production pipeline (`vsRibbon` + `fs`) over one fragment module, one vertex-buffer layout and one instance VBO; `draw(pass, instances, count, showImpostor?)`; `INSTANCE_FLOATS` 34 / `INSTANCE_STRIDE` 136.
- `orbitTrailsLayer` packs every visible orbit into one run with one count (culling `eSpan = 0` instances); no front/back partition.
- A `debug.showOrbitTrailImpostor` toggle in the DebugPanel's Debug Overlays section draws the ribbon hull over the real trails (one debug pipeline, `fsImpostorRibbon`; `fsImpostorFallback` is deleted with the fallback), built lazily so production pays nothing (Task 10, narrowed by Task 12).

**Named observable behaviours** (Task 8)

- Solar-system planets, the Moon close-up, the S-star cluster and the edge-on Earth zoom all draw **unbroken** trails with unchanged colour, tail falloff and fade behaviour.
- No segment joint reads brighter than its neighbours (additive double-add) and none reads as a notch (gap).
- A camera inside an orbit draws that trail as an open-arc ribbon like every other orbit — no fullscreen wash (Amendment 2; supersedes both the original "fallback path" wording and the near-plane-clamp wording). (**Corrected 2026-08-01:** "no oversized triangles at any pose" overstated the guarantee — `clampReach` bounds each neighbour's reach to `maxReachPx = 4 · length(viewportPx)`, so `halfWidth` can still reach ~4.6 viewport diagonals and a quad ~9 screen widths in principle; hardware-verified not hit at either production pose.)
- The hide/show fade, the apparent-size fade-in, and the whole-layer `enabled()` cull behave exactly as before.

**Measured** (Task 7, re-run at the Amendment 2 HEAD)

- `galactic-centre` orbit-trails < 1.5 ms real, down from **4.3** (unchanged target; the originally-quoted 7.6 ms was retracted as contaminated — see the ledger's CAUTION line).
- `solar-system` orbit-trails also drops, and issues **zero fullscreen fallback draws** — the pose the first amendment exists for; no longer just a ±0.5 ms noise-band check.

**Deferral boundary — out of scope**

- The residual speckle at the edge-on Earth-zoom pose (`docs/backlog/2026-07-18-orbit-trail-residual-speckle.md`) — the fragment math is unchanged by design, so the speckle is expected to survive untouched.
- Any change to `CULL_PX`/`FULL_PX`, the per-orbit fade, `enabled()`'s per-region reach cull, or `FOREGROUND_MAX_DISTANCE_MPC`.
- Tuning `SEGMENTS` beyond the spec's 96 unless Task 7's sweep demands it; adaptive per-orbit segment counts.
- The other per-layer costs `galactic-centre` exposes (`star-catalog` and `star-upsample` also read 7.6 ms real at that pose) — this plan buys only the trails.

## Task DAG

```
T1 (baselines + draft PR)
      |
      +--> T2 (shader constants) --+--> T4 (ribbon vertex stage) --+
      |                            |                               |
      +--> T3 (composeOrbitConic) -+--> T5 (renderer)  ------------+--> T6 (layer) --> T7 (perf)
                                   |                                                     |
                                   +-----------------------------------------------------+--> T8 (visual) --> T9 (radar + close-out)

T6 --> T10 (debug overlay) --+
                              +--> T11 (near-plane clamp) --> T12 (delete fallback) --> T7' (re-measure) --> T8' (re-visual) --> T9 (radar + close-out)
T4 -----------------------------> T11

T12 --> [fold-fix rounds, superseded] --> A2 (visible-arc redesign, Amendment 2) --> T7'' --> T8'' --> T9
```

T9 moves to the end of the amended chain — `/feature-done` and the entanglement-radar pass must review the branch's FINAL shape, and Task 12 is what makes it final. Running T9 at its original position (after the first T8) would radar-review and close out a state the plan no longer ships.

- **T2 ∥ T3** — disjoint files, no shared symbol.
- **T4 ∥ T5** — disjoint files (`.wesl` vs `.ts`); both need T2's `SEGMENTS`/`RIBBON_SEGMENTS`, and the `'vsRibbon'` entry-point name is pinned in this plan so they cannot drift apart. T5 additionally needs T3 only for the record layout, which is also pinned here — not for code.
- **T6** needs T3 (the returned fields) and T5 (the `draw` signature); it is the only task touching the layer.
- **T7 ∥ T8** may run together once T6 lands; T9 is last.
- **T10** (debug overlay, added during execution) needs T6 and runs ∥ T7; it should land before T8 so the visual pass can use it.
- **T11** (near-plane clamp, added 2026-08-01) touches only `vertex.wesl`; needs T4 for the file to exist, nothing else — it can run any time after T4, independent of T5–T10.
- **T12** (delete the fallback, added 2026-08-01) needs T11 (the ribbon must handle inside-orbit projections before the fallback that used to cover them is removed) and touches every file T3/T5/T6/T10 touched, so it must run after all of them land. T7 and T8 (already executed once, per the ledger) both need re-running against T12's HEAD — the earlier numbers and visual confirms covered the fallback-present architecture, not this one.
- Every task owns a disjoint file set, so reviews pipeline freely (`sdd-execution.md` Rule 2). The one shared-file hazard is Task 3's defensive touch of the layer test's mock — if it happens, Task 6 must re-read that file rather than trust the plan. Task 12 is the exception: it touches nearly every file the earlier tasks own, by design (it is undoing their fallback half), so it does not pipeline with anything and should run alone.
