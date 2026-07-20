# Body normal-map shading (Moon-first) — implementation plan

**Spec:** [`docs/superpowers/specs/2026-07-20-body-normal-maps-design.md`](../specs/2026-07-20-body-normal-maps-design.md)
**Date:** 2026-07-20
**Branch(es):** `feat/body-normal-maps` (one branch/PR per phase — see Global constraints)

## Goal

Give the airless textured bodies real surface relief that catches the sun at the
terminator, by sampling a tangent-space **normal map** in the shared `texturedBody`
fragment — the technique Earth already uses. The normal map is **baked from an
elevation heightfield** (as Earth bakes its `normal` kind from GEBCO), so the relief
is real topography. Scope is **Moon-first**: prove the whole path (fetch → bake →
tier → runtime → shader) end-to-end on the Moon; Mercury is a documented fast-follow.

The work lands as **one PR** on `feat/body-normal-maps`, built task-by-task as a
sequence of green, committable steps (each task is its own commit, so the two
behaviour-preserving prep refactors stay a distinct, reviewable diff from the
feature within the single PR):

- **Prep A** — extract the TBN math into `lib/normalMap.wesl`; Earth calls it (behaviour-preserving).
- **Prep B** — fold `texturedBodyRenderer`'s sphere maps behind `setMap(id, kind, bmp)` + `KIND_CFG`; route the non-Earth commit by `entry.kind` (behaviour-neutral, surface only).
- **Feature** — the Moon normal map end-to-end (data rows + bake exaggeration + renderer binding 4 + shader perturbation).

## Architecture

The feature is a **data delta on top of two prep refactors**, not a bolt-on. The
prep PRs create the joints the feature needs (a shared perturb helper; a per-kind
map surface on the shared renderer; kind-routed commit), so the feature is a
registry row + a KIND_CFG row + a shader binding.

Key existing shapes the tasks build on (read these before implementing):

- `src/services/gpu/shaders/bodies/earth/fragment.wesl:166-185` — the inline TBN block to extract (calls with `in.tangent`, the interpolated east tangent).
- `src/services/gpu/shaders/lib/bodyLighting.wesl`, `lib/limbDarkening.wesl` — the sibling shared-lib style + the `pass-cam-don't-capture` / data-gate idioms.
- `src/services/gpu/renderers/bodies/texturedBodyRenderer.ts` — `setTexture`/`clearTexture`/`setRingTexture`/`buildBindGroup`/`resourcesFor`/`BodyResources`/`bindGroupLayout`. Prep B rewrites the sphere-map surface here; the **ring** path (binding 3, `setRingTexture`) stays untouched.
- `src/services/gpu/renderers/bodies/earthRenderer.ts:471` — `setMap(kind, bitmap)` is the exact per-kind shape Prep B mirrors (Earth already routes surface/night/material/normal/clouds through one `setMap`).
- `src/services/engine/wiring/bodyTextureSlotRegistry.ts:85-113` — `commitBodyTexture`; the non-Earth branch (line 99) calls `setTexture` and must route by `entry.kind`.
- `src/data/bodies/bodyTextureRegistry.ts:65-82` — `earth.kinds.normal:'medium'` is the model; `moon` gains the same.
- `tools/utils/io/textureSources.ts:84` — `earth.normal:{ native:'textures.earthElevation' }` is the model; `moon` gains `{ native:'textures.moonElevation' }`.
- `tools/utils/io/rawDataRegistry.ts:626` — `textures.earthElevation` is the model row for the new `textures.moonElevation`.
- `tools/textures/buildTextures.ts:282-303` (`bakeNormalOnce`) + `tools/textures/bakeNormalMap.ts:75` (`DEFAULT_EXAGGERATION`) — the bake path the exaggeration override extends.
- `tools/fetch/fetchTextures.ts:136` — the fetch set derives from `ALL_BODY_TEXTURE_KEYS` over `TEXTURE_SOURCES`, so `moon.normal` joins the pull automatically once the source row exists (**no fetcher edit**).

## Tech stack

- **WGSL/WESL** shaders via the `wesl-plugin` linker (`?static` imports, literal `package::` paths). New lib module + two fragment edits. See the `wesl-shaders` skill for import syntax + linker quirks; one-fn-one-file is an anti-idiom in WESL, so a single-`fn` lib module is idiomatic.
- **TypeScript** renderer + wiring; **Vitest** for the structural/behavioural tests.
- **sharp/libvips** in the offline `buildTextures` bake; the Moon source is a 16-bit `.tif` read `.greyscale().raw()` → 8-bit heightfield.

## Global constraints

- **Normal-map format MUST be `rgba8unorm` (LINEAR), never `-srgb`.** The RG channels are numeric slope data, not colour; an sRGB decode on read corrupts the gradient. (The surface map stays `rgba8unorm-srgb`.)
- **Prep A and Prep B are behaviour-preserving.** Prep A must leave Earth pixel-identical; Prep B must leave every textured body's output byte-identical (surface still at binding 2, same placeholder texel, same mip/flipY upload). The **Feature** is the only visible change.
- **One PR to `main`** carrying all tasks in order (Prep A → Prep B → Feature) as separate commits; the docs (this plan + the spec) ride it. The prep refactors stay distinct *commits* from the feature commits so the diff is reviewable per concern, even though they share the PR (user decision — overrides the refactor-ground default of a separate prep PR).
- **WGSL shader correctness is verified VISUALLY over HMR, not by headless tests** (project posture — a JS mirror of WGSL `cross`/`sqrt`/`pow` is a contrived restatement the suite forbids). Every shader task's verification step says this explicitly and names what to look at.
- **Tests follow `conventions/testing.md`** — structural invariants + behavioural branch assertions only; no numeric/registry restatement, no mirror tests, no clamp-boundary tests.
- **Conventions:** `type` aliases (never `interface`); one type per file in `@types/`, one function per file in `utils/`; deep relative imports, no barrels; didactic comments that explain *why*.
- **Commits use the user's git identity** (no `--author`); end each commit message with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Stage specific paths — never `git add -A`/`.`. Format only touched files.
- **No file moves/renames in this plan** (the one new file is green-field), so no `npm run move-files` step is needed.

---

## Phase Prep A — shared `lib/normalMap.wesl` helper (shader-only, behaviour-preserving)

**First commits of the single PR.** Extract Earth's inline TBN math into a shared
lib fn and have Earth call it. These commits also carry the spec + this plan.

### Task A1: Extract `perturbNormal` into `lib/normalMap.wesl`; Earth calls it

**Files:** `src/services/gpu/shaders/lib/normalMap.wesl` (new), `src/services/gpu/shaders/bodies/earth/fragment.wesl` (modify). Commit the spec + plan docs in this PR too.

**New module contract** — `lib/normalMap.wesl` exports exactly:

```wgsl
// Perturb a geometric normal by a tangent-space normal-map sample.
// Ng    : geometric unit normal (already renormalized), body-local frame
// T     : unit tangent (+u = east), body-local frame — caller supplies it (raw;
//         this fn Gram-Schmidt-re-orthonormalizes it against Ng)
// encRG : the map's raw RG in [0,1] (LINEAR); nx,ny decode to [-1,1], nz reconstructed
fn perturbNormal(Ng: vec3<f32>, T: vec3<f32>, encRG: vec2<f32>) -> vec3<f32>
```

Behaviour (the contract the body must hit — see spec §2 and `bakeNormalMap.ts:52-67`
for the sign convention this must preserve):

- `nxy = encRG * 2 - 1`; `nz = sqrt(max(1 - dot(nxy,nxy), 0))`.
- `Tn = normalize(T - Ng * dot(Ng, T))` (Gram-Schmidt against `Ng`).
- `Bt = cross(Ng, Tn)` (points +v = north, matching the bake's G axis).
- returns `normalize(Tn*nxy.x + Bt*nxy.y + Ng*nz)`.
- **Data-gate identity:** a flat sample `encRG == (0.5, 0.5)` ⇒ `nxy == 0`, `nz == 1` ⇒ returns `Ng` unchanged.

**Earth edit** — replace the inline block at `earth/fragment.wesl:173-185` (the
`nEnc`/`nxy`/`nz`/`Ng`/`T`/`Bt`/`n` lines) with:

```wgsl
import package::lib::normalMap::perturbNormal;
// …
let Ng = normalize(in.normalLocal);
let nEnc = textureSample(normalTexture, earthSampler, in.uv).rg; // LINEAR RG
let n = perturbNormal(Ng, in.tangent, nEnc);
```

Everything downstream (`v`, `l`, `P`, the shadow/night terms) is unchanged; keep the
existing `## Renormalize the interpolated normal + normal mapping` header prose but
point it at the shared helper. `in.tangent` is passed **raw** (the helper does the
Gram-Schmidt that the old inline `T = normalize(in.tangent - Ng*dot(...))` did).

- [x] Add `lib/normalMap.wesl` with the `perturbNormal` fn + a didactic module header (decode → reconstruct → Gram-Schmidt → rotate; note the flat-sample identity and that it is the shared home for the TBN convention).
- [x] Refactor `earth/fragment.wesl` to import + call `perturbNormal(Ng, in.tangent, nEnc)`, deleting the inline TBN lines.
- [x] `npm run build` — the WESL linker resolves the new `package::lib::normalMap::perturbNormal` import and the Earth pipeline still compiles (tsc + vite build clean).
- [ ] **Visual gate (no headless test — project posture):** over HMR, confirm the textured Earth is unchanged — the relief still catches light on the same side of ridges/coastlines near the terminator, no inverted/mirrored lighting. This confirms the extracted TBN sign convention matches the inline one. *(batched for user visual pass at end of PR)*
- [x] Commit (spec + plan + shader files).

---

## Phase Prep B — `texturedBodyRenderer.setMap` + kind-routed commit (behaviour-neutral)

**Prep B commit.** Fold the shared renderer's **own sphere maps** (today just `surface`)
behind `setMap(id, kind, bmp)` driven by a per-kind `KIND_CFG`, and route the
non-Earth commit by `entry.kind`. Surface-only ⇒ **byte-identical output**. The ring
path (binding 3) is untouched.

### Task B1: `setMap` + `KIND_CFG` + kind-routed commit (surface only)

**Files:** `src/services/gpu/renderers/bodies/texturedBodyRenderer.ts` (modify), `src/@types/rendering/TexturedBodyRenderer.d.ts` (modify), `src/services/engine/wiring/bodyTextureSlotRegistry.ts` (modify), `tests/services/gpu/renderers/bodies/texturedBodyRenderer.test.ts` (modify), `tests/services/engine/wiring/bodyTextureSlotRegistry.test.ts` (modify).

These changes are **atomically coupled** — the `setTexture → setMap` type change
breaks the slot-registry caller — so they land as one commit for a green typecheck.

**Renderer type** (`TexturedBodyRenderer.d.ts`) — replace `setTexture(bodyId, bitmap)` with:

```ts
setMap(bodyId: BodyTextureId, kind: TextureKind, bitmap: ImageBitmap): void;
```

(Import `TextureKind` from `../data/TextureKind`.) `clearTexture`, `setRingTexture`,
`draw` keep their signatures; update the doc prose to describe the per-kind map surface.

**Renderer implementation** (`texturedBodyRenderer.ts`):

- Introduce a per-kind config, keyed by `TextureKind`, **one row** for Prep B:

  ```ts
  // Shape of each entry:  { binding: number; format: GPUTextureFormat; placeholder: [number, number, number, number] }
  const KIND_CFG = {
    surface: { binding: 2, format: 'rgba8unorm-srgb', placeholder: [128, 128, 128, 255] },
  } as const satisfies Partial<Record<TextureKind, { binding: number; format: GPUTextureFormat; placeholder: readonly [number, number, number, number] }>>;
  ```

- `BodyResources.texture: GPUTexture | null` → `maps: Map<TextureKind, GPUTexture>`. `ringTexture` and `uniformBuffer`/`bindGroup` stay.
- Build **one 1×1 placeholder texture per `KIND_CFG` entry** (its `format` + `placeholder` texel), replacing the single `placeholderTexture`. Keep `placeholderRing` exactly as-is.
- `buildBindGroup` and `bindGroupLayout` **derive their sphere-map texture entries from `KIND_CFG`** (iterate its rows, binding each kind's `maps.get(kind) ?? placeholder[kind]` at `cfg.binding`), so a new kind row in the Feature extends both automatically. Bindings 0 (uniform), 1 (sampler), 3 (ring) stay fixed. Output for surface must be identical to today (binding 2, mid-grey placeholder).
- `setMap(bodyId, kind, bitmap)` looks up `KIND_CFG[kind]` for `format` + `binding`, creates the sized texture (`mipLevelCount` levels + `RENDER_ATTACHMENT`), uploads level 0 with `flipY: true`, runs `generateMipChain`, stores into `maps`, rebuilds the bind group. (The old `setTexture` body, parameterised by kind → format.)
- `clearTexture(bodyId)` frees **all** evictable sphere maps: destroy every texture in `maps`, clear the map, rebuild the bind group against the placeholders. Ring + uniform buffer untouched (as today). Still a no-op when nothing is resident. (For the Feature this means a body leaving proximity releases surface + normal together — the intended eviction; both slots gate on the same body proximity.)
- `destroy()` destroys every `maps` value + the per-kind placeholders + the ring placeholder.

**Commit dispatch** (`bodyTextureSlotRegistry.ts:98-99`) — the non-Earth branch routes by kind:

```ts
} else if (isTexturedBodyKey(entry.bodyId)) {
  state.gpu.texturedBodyRenderer?.setMap(entry.bodyId, entry.kind, bitmap);
}
```

Update the surrounding docstring (`setTexture` → `setMap`, "routes by `entry.kind`").

**Renderer test** (`texturedBodyRenderer.test.ts`) — update to the new surface:

- [ ] `setMap / setRingTexture / draw are callable with the right arity` — assert `renderer.setMap.length === 3` (was `setTexture.length === 2`), `setRingTexture.length === 2`, `draw.length === 3`.
- [ ] Retitle the existing "four-binding layout" test to keep asserting bindings **0 (uniform), 1 (sampler), 2 (texture), 3 (texture)** are present — Prep B stays four-binding (surface + ring). (The Feature adds binding 4.)
- [ ] Rename the two `setTexture(...)` call sites in the mip-chain + clear tests to `setMap('mars', 'surface', bitmap)`; keep asserting: the surface texture is sized with `mipLevelCount(w,h)` levels, carries `RENDER_ATTACHMENT`, and the downsample chain submits ≥1 command buffer.
- [ ] `clearTexture destroys the body surface texture and reverts to the placeholder` + `clearTexture calls destroy on the body surface texture (no leak)` — keep, driving via `setMap(..., 'surface', ...)`; the surface texture's `destroy` fires once on clear, and the body still `draw`s afterwards (placeholder rebind).

**Slot-registry test** (`bodyTextureSlotRegistry.test.ts`) — update the `Gpu` mock's `texturedBodyRenderer` to expose `setMap` instead of `setTexture`, and:

- [ ] `a non-'earth' body slot's commit dispatches to texturedBodyRenderer.setMap(bodyId, 'surface', …)` — assert `setMap` called once with `('mars', 'surface', bitmap)`; Earth's renderer untouched.
- [ ] Keep the onRelease test (`clearTexture('mars')` fires once), the Earth `setMap` tests, and the ring `setRingTexture` test unchanged (ring path is not touched).

Verification:

- [x] `npm run typecheck` clean (the type rename propagates to the one caller).
- [x] `npm test -- texturedBodyRenderer bodyTextureSlotRegistry` green (19 tests).
- [ ] **Visual:** over HMR, every textured body (Mars, Jupiter, the Moon, …) renders exactly as before — behaviour-neutral surface consolidation. *(batched for user visual pass at end of PR)*
- [x] Commit.

---

## Phase Feature — Moon normal map end-to-end

**Feature commits (same PR).** Add the Moon's elevation source + registry rows, the per-body bake
exaggeration knob, the renderer's `normal` binding, and the shader perturbation.

### Task F1: Data rows — Moon elevation source + `normal` registry kind + slot-commit test

**Files:** `tools/utils/io/rawDataRegistry.ts` (add), `tools/utils/io/textureSources.ts` (add), `src/data/bodies/bodyTextureRegistry.ts` (add), `tests/services/engine/wiring/bodyTextureSlotRegistry.test.ts` (add a test).

- `rawDataRegistry.ts` — add `'textures.moonElevation'`, mirroring `textures.earthElevation:626`:
  - `path: 'data/raw/textures/ldem_16_uint.tif'`
  - `kind: 'file'`, `source: 'gitignored'`
  - `description`: NASA SVS CGI Moon Kit LOLA elevation, 5760×2880 16-bit uint (half-metres, ref sphere 1737.4 km), centered 0° longitude to match the SSS albedo; build-only bake input for the Moon's normal map, never shipped as a runtime texture; ~31.7 MB.
  - `upstream: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif'`
  - `fetcher: 'tools/fetch/fetchTextures.ts'`, `readme: 'textures.readme'`
- `textureSources.ts` — `TEXTURE_SOURCES.moon` gains `normal: { native: 'textures.moonElevation' }` (same shape as `earth.normal:84` — full-pull only, **no** `devFilename`/`devKey`). `moon.surface` is unchanged.
- `bodyTextureRegistry.ts` — `moon.kinds` becomes `{ surface: 'large', normal: 'medium' }` (the `medium`/4k ceiling matches Earth's `normal`; a normal map downsamples cleanly). This one edit auto-joins `ALL_BODY_TEXTURE_KEYS`, slot minting, the fetch set, and the build work list.

No fetcher edit (derives from `TEXTURE_SOURCES`) and no `KIND_WRITERS` edit (the
`normal` writer already exists for Earth).

Tests:

- [ ] The existing drift guards go green automatically and are the real coverage: `textureBuildEntries` "covers every non-ring (body,kind) in TEXTURE_SOURCES" (`buildTextures.test.ts`) now includes `moon:normal`; `textureSources.test.ts` "every textured body/ring family key has a surface source" still holds. Do **not** add a numeric/registry restatement of the moon row.
- [ ] Add to `bodyTextureSlotRegistry.test.ts`: `the 'moon:normal' slot's commit routes to texturedBodyRenderer.setMap('moon','normal', …)` — load the `moon:normal` slot, await `ready`, assert `setMap` called with `('moon', 'normal', bitmap)` and **not** with `('moon', 'surface', …)`. This is the load-bearing proof the kind routing added in Prep B carries the new kind through (it fails if the commit ever collapses kind back to `surface`).

Verification:

- [x] `npm run typecheck` clean (the `satisfies Record<…>` completeness on `TEXTURE_SOURCES` + the registry `Record<BodyTextureId,…>` both hold).
- [x] `npm test -- buildTextures textureSources bodyTextureSlotRegistry` green (11 tests).
- [x] Commit.

### Task F2: Per-body bake exaggeration override

**Files:** `tools/textures/bakeNormalMap.ts` (add table + resolver), `tools/textures/buildTextures.ts` (use resolver), `tests/tools/textures/bakeNormalMap.test.ts` (add test).

`DEFAULT_EXAGGERATION = 4` (`bakeNormalMap.ts:75`) is global; the Moon's relief wants
a stronger, eye-tuned gain. Add — beside the const, keeping the module pure (no `src`
imports; key by `string` like `LIMB_DARKENING_PARAMS`):

```ts
// Per-body gradient-gain override. A body absent from the table bakes at
// DEFAULT_EXAGGERATION — the data-gate shape of LIMB_DARKENING_PARAMS.
export const NORMAL_EXAGGERATION: Readonly<Record<string, number>> = {
  moon: /* seed stronger than DEFAULT_EXAGGERATION, ~8; tuned by eye in F4 */,
};
export function exaggerationFor(bodyId: string): number; // NORMAL_EXAGGERATION[bodyId] ?? DEFAULT_EXAGGERATION
```

`buildTextures.ts` — in `bakeNormalOnce` (`:298`), pass `exaggerationFor(bodyId)`
instead of `DEFAULT_EXAGGERATION`. Confirm (comment, no code change) that
`sharp(...).greyscale().raw()` reads the 16-bit `.tif` down to an 8-bit greyscale
heightfield — the `Uint8Array` `bakeNormalMap` expects — and that the 8-bit
quantization is acceptable for v1 (Earth already lives with it).

Test (`bakeNormalMap.test.ts`) — behaviour of the fallback branch, not a numeric restatement:

- [ ] `exaggerationFor falls back to DEFAULT_EXAGGERATION for a body with no override` — assert `exaggerationFor('venus') === DEFAULT_EXAGGERATION` (fails if the resolver drops the `?? DEFAULT` and returns `undefined`/`NaN`).
- [ ] Optional structural drift-catcher (mirror `LIMB_DARKENING_PARAMS`'s "every key names a real seeded body"): every `NORMAL_EXAGGERATION` key is a real `BodyTextureId` (import the registry in the test). Do **not** assert the moon's numeric value (it is eye-tuned; a restatement fails on every legitimate tweak).

Verification:

- [x] `npm test -- bakeNormalMap` green (7 tests); `npm run typecheck` clean.
- [x] Commit.

### Task F3: Renderer `normal` binding (binding 4, LINEAR)

**Files:** `src/services/gpu/renderers/bodies/texturedBodyRenderer.ts` (add KIND_CFG row), `src/@types/rendering/TexturedBodyRenderer.d.ts` (doc), `tests/services/gpu/renderers/bodies/texturedBodyRenderer.test.ts` (add assertions).

Add one row to `KIND_CFG` (from Prep B):

```ts
normal: { binding: 4, format: 'rgba8unorm', placeholder: [128, 128, 255, 255] }, // LINEAR — RG are slope data, never -srgb
```

Because `buildBindGroup` + `bindGroupLayout` derive their texture entries from
`KIND_CFG` (Prep B), this row **automatically**: adds binding 4 (`texture: { sampleType: 'float' }`) to the layout, binds the normal map-or-placeholder at binding 4 in every body's bind group, builds the linear flat-normal 1×1 placeholder, and makes `setMap(id, 'normal', bmp)` upload an `rgba8unorm` texture (flipY + mip chain, via the generic path). No other renderer code changes. Update the `.d.ts` doc prose to note `normal` as a supported kind (linear, binding 4).

Tests (`texturedBodyRenderer.test.ts`):

- [ ] Update the layout test to assert binding 4 is present with a `texture` entry (now a **five**-binding layout: uniform, sampler, surface, ring, normal).
- [ ] `setMap('moon','normal', …) creates a LINEAR rgba8unorm normal texture` — assert the created normal texture's `format === 'rgba8unorm'` (NOT `-srgb`) and it carries `RENDER_ATTACHMENT` (the mip chain needs it). Load-bearing: an `-srgb` format silently corrupts the slope data — a runtime rule no compiler catches.
- [ ] `the normal placeholder is the linear flat-normal texel` — find the 1×1 `rgba8unorm` placeholder and assert its `writeTexture` payload is `[128,128,255,255]` (decodes to `(0,0,1)` ⇒ the `perturbNormal` identity ⇒ a normal-less body shades as today).

Verification:

- [x] `npm run typecheck` clean; `npm test -- texturedBodyRenderer` green (15 tests).
- [x] `npm run build` — the pipeline still constructs with a layout binding (4) the shader does not yet sample (valid in WebGPU; the shader adopts it in F4). No visual change yet (the fragment ignores binding 4).
- [x] Commit.

### Task F4: `texturedBody` fragment perturbs the normal

**Files:** `src/services/gpu/shaders/bodies/texturedBody/fragment.wesl` (modify). `io.wesl` + `vertex.wesl` are **unchanged** (no tangent varying — computed in-shader).

Add the normal texture binding + perturbation (spec §4):

```wgsl
import package::lib::normalMap::perturbNormal;
@group(0) @binding(4) var normalTexture: texture_2d<f32>;
// …in fs(), replacing `let n = normalize(in.normalLocal);`:
let ng = normalize(in.normalLocal);
let T  = normalize(cross(vec3<f32>(0.0, 0.0, 1.0), ng)); // +z pole ⇒ east tangent (uvSphereMesh pole is +z)
let n  = perturbNormal(ng, T, textureSample(normalTexture, bodySampler, in.uv).rg);
```

`n` (the perturbed shading normal) then flows into **everything** downstream that
used the old geometric normal: `ringSunVisibility(n, …)`, `litShade(n, …)`, the
Minnaert `noL = max(dot(n, u.sunDirLocal), 0)`, `v = normalize(u.camPosLocal - n)`,
`noV`. Reuse the shared `bodySampler` (binding 1). Update the module header to
document the in-shader tangent (`cross(+z, n)` = east; pole degeneracy where `n ≈ ±z`
yields a near-zero `T` but relief vanishes at the poles, so it is visually harmless —
guard only if a pole artefact shows). Keep the flat-placeholder note: a body with no
`normal` map perturbs by zero ⇒ shades identically to today (the data-gate, no uniform flag).

- [x] Add binding 4 + the `perturbNormal` import + call; route `n` through the lit/limb terms; route the geometric `ng` through the position terms (ring query + view-vector origin).
- [x] `npm run build` — the shader links (binding 4 now matches the layout from F3) and the pipeline compiles.
- [x] **Visual gate (no headless test — project posture):** PASSED 2026-07-20 — Moon crater relief self-shades correctly at the terminator over HMR; no regressions. `NORMAL_EXAGGERATION.moon = 8` accepted as-is.
- [x] Commit.

---

## Deploy (post-merge, NOT a code task)

After the PR merges, from the **main** worktree (worktrees have their own
`data/` — see project memory `project_worktree_data_isolation`):

1. **Announce the ~31.7 MB source fetch before pulling** (`feedback_announce_big_downloads`), then `npm run fetch-textures` (or `--confirm` for the full pull) to land `ldem_16_uint.tif` into `data/raw/textures/`. It joins the fetch set automatically (F1).
2. `npm run build-textures` — bakes `moon-normal-*.webp` tiers (linear lossless WebP, `medium` ceiling) alongside the existing outputs.
3. `npm run sync-r2-secure` — uploads the new Moon normal tiers + purges the CDN (canonical secure wrapper; see `reference_sync_r2_canonical`).

The built tiers are small; only the one-time source fetch is large.

## Follow-ups (out of scope — tracked in the spec)

- **Mercury** fast-follow (needs a one-time USGS resample to ~8k GeoTIFF; a `docs/backlog/` detail file tracks it).
- **Earth tangent simplification** — Earth still bakes a tangent VBO; it could switch to the in-shader `cross(+z, Ng)` this feature uses and shed the attribute. Backlog, not needed here.
- Other airless bodies (Mars/MOLA, the moons) join by a source row + a `normal` registry kind — table-driven, zero new code.

---

## Self-review (writing-plans)

- **Spec coverage.** Spec §1 assets/pipeline → F1 (source + registry rows) + F2 (exaggeration + 16-bit read note) + Deploy. §2 `lib/normalMap.wesl` → A1. §3 renderer `setMap` + `KIND_CFG` + normal binding + linear format → B1 (setMap/surface) + F3 (normal row). §4 vertex/fragment (io unchanged, in-shader tangent, flat-placeholder gate) → F4. §5 commit dispatch by kind → B1 (routing) + F1 (moon:normal test). Ground-prep Prep A/Prep B → the two prep phases. Testing section → each task's test steps (shader = visual). Deploy → the Deploy block. **No spec requirement is left unmapped.**
- **Placeholder scan.** The only intentional "fill-in" is `NORMAL_EXAGGERATION.moon`'s numeric seed (F2) — deliberately eye-tuned in F4's visual pass, matching how `DEFAULT_EXAGGERATION` and `LIMB_DARKENING_PARAMS` are described as visual starting points; not a numeric contract to pin. No other TBDs.
- **Type consistency.** `setMap(bodyId: BodyTextureId, kind: TextureKind, bitmap: ImageBitmap): void` is used identically in the `.d.ts` (B1), the renderer (B1), the commit dispatch (B1), and the moon:normal test (F1). `KIND_CFG` entry shape `{ binding, format: GPUTextureFormat, placeholder }` is stated once (B1) and extended by one row (F3). `TextureKind` already includes `'normal'` and `BodyTextureId` already includes `'moon'` — **no type-union edits needed**.
