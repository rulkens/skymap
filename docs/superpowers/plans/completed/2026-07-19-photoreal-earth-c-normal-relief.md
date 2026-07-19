# Photoreal Earth C — Normal / Relief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Give Earth's terminator **relief** — mountains and ranges catch grazing sunlight — by baking a **tangent-space normal map** offline from an elevation heightmap and perturbing the surface shading normal with it. The bake is the pipeline's first **derived/computed** output; every existing texture is a straight resize of a fetched source.

**Architecture:** Earth keeps its own renderer. The offline bake is a new pure `tools/textures/bakeNormalMap` capability that consumes a fetched elevation heightmap and emits linear-RG normal tiers through plan A's `writeLinearTier`. The map flows through the SAME `(body, kind)` slot family, single `TEXTURE_SOURCES` table, and single `bodyTextureFilename` home the material map already uses (plan A) — the ONLY divergence for this baked kind is the build's per-kind **writer** (a gradient bake, not a channel re-pack of the source's own pixels). At runtime the cubesphere tangents plan A already emits are uploaded, forwarded as a `VSOut.tangent` varying, and used to transform the sampled tangent-space normal into the local frame fed to `pbr.wesl`. Exaggeration is baked **entirely offline** — no runtime uniform scalar.

**Tech Stack:** TypeScript + Vite + React shell, raw WebGPU + WESL shaders, `sharp`/libvips for the offline texture build, Vitest.

**Spec:** docs/superpowers/specs/2026-07-18-photoreal-earth-design.md (§5 normal bullet, §9.1 normal + elevation rows, §9.3 `bakeNormalMap`)

**Depends on:** plan A (`docs/superpowers/plans/2026-07-19-photoreal-earth-a-cubesphere-pbr-surface.md`) — consumes its cubesphere **tangents**, `writeLinearTier`, `isLinearTextureKind`, `EarthSurfaceUniforms`, the `pbr.wesl` shading path, the `(body,kind)` fetch/build iteration (its Task 6), and the material-map wiring pattern (its Task 7). Plan A must be merged first.

### Header notes — resolved decisions (do not re-litigate)

- **`bakeNormalMap` is the ONLY new build primitive here.** Spec §12's table listed both `writeLinearTier` and `bakeNormalMap` under C, but `writeLinearTier` moved to plan A — the material map is the first **linear** consumer, and §9.3's "material must not be sRGB-encoded" forced it earlier. Plan C adds only the **derived** capability on top of A's linear primitive.
- **`normal` is the SECOND linear kind.** Add `'normal'` to plan A's `isLinearTextureKind` predicate (`src/utils/scene/isLinearTextureKind.ts`) — do NOT fork a parallel predicate. That one edit makes the filename PNG (`bodyTextureFilename` routes ext through it — plan A Task 7), the fetch decode colour-managed-off (`bodyTextureFetcher` branches on it — plan A Task 8), and the GPU format `rgba8unorm` not `-srgb` (`earthRenderer.setMap` — plan A Task 8) all follow automatically.
- **Exaggeration is baked offline; NO runtime scalar.** The spec offers a runtime normal-strength scalar via the `_pad0` slot only "if unavoidable". It is avoidable — the gradient exaggeration is a build-time constant folded into the baked bytes, so `EarthSurfaceUniforms` is **unchanged** and both `_pad0`/`_pad1` stay free for plan D. (Report this to the plan D drafter.)
- **The bake wrinkle (derived vs fetched) resolves at ONE seam.** `TEXTURE_SOURCES.earth.normal.native` names the **elevation** heightmap (a different physical quantity), not the normal map's own pixels. Fetch pulls it like any native source (plan A's `(body,kind)` rewire — no fetch branch). The build iterates kinds and dispatches the **writer** per kind (plan A already: `surface → writeBodyTier`, `material → channel-repack + writeLinearTier`); this plan adds `normal → bakeNormalMap + writeLinearTier`. The baked-vs-fetched distinction lives **entirely** in that writer branch — the single source table and single filename home are untouched. This is Task 3.

## Global Constraints

Binding values copied from the spec; every task inherits them.

- **Normal map (spec §5, §9.1):** tangent-space, **linear RG** (`R = nx`, `G = ny`, remapped `[-1,1]→[0,1]`; `B/A` spare), **Z reconstructed in-shader**. **4K ceiling** (spec §9.2) → `kinds.normal = 'medium'`. Sampled with the cubesphere tangents.
- **Elevation (bake input, spec §9.1):** a GEBCO/SRTM downsampled heightmap proxy — **build-only, never shipped**, gitignored + `.sha256` + fetcher + README provenance. Verify the exact URL + native dims live before pinning the registry row (feedback: verify-external-data-before-spec).
- **Bake (spec §9.3):** elevation heightmap → tangent-space normal via a **gradient (Sobel-style) kernel** with a **named tunable exaggeration constant**. Pure function → real unit tests. No adaptive machinery.
- **Filename convention (spec §9.3):** `normal` is a non-surface kind → segmented `earth-normal-<px>.png`. The single home is `bodyTextureFilename`; PNG falls out of adding `'normal'` to `isLinearTextureKind` (plan A already routes ext through it). Never introduce a second name site.
- **Performance (spec §11):** target 60 fps desktop / 30–60 fps iOS. iOS-strict WESL: no `texture_1d`, valid struct/varying layout — use `createShaderModuleWithDevLog` output if the shader fails to link.
- **Downloads (spec §9.4):** the elevation-source fetch (~10–30 MB) announces its size and **gets user go-ahead BEFORE fetching** (announce-big-downloads). Nothing downloads except in the explicit fetch task.
- **Conventions:** `type` aliases never `interface`; one symbol per file in `src/utils/` + `tools/` + `src/@types/` (filename = export name); deep relative imports, no barrels; didactic multi-paragraph module headers; WESL comments use single quotes (NO backticks), WESL imports use literal `package::` paths; wgpu-matrix + `Vec3` aliases never raw tuples; raw-data paths via `rawDataPath('<key>')`; stage specific paths on commit (never `git add -A`).

---

## Task 1: `bakeNormalMap` — the derived gradient bake (pure, TDD)

**Files:**

- Create `tools/textures/bakeNormalMap.ts`
- Create `tests/tools/textures/bakeNormalMap.test.ts`

**Interfaces — Produces:**

```ts
// tools/textures/bakeNormalMap.ts — the FIRST derived/computed texture output (spec §9.3).
// Sobel-gradient a single-channel heightfield into a tangent-space normal map,
// encoded linear RG (Z reconstructed in-shader). PURE over plain typed arrays so it
// unit-tests without sharp; the build (Task 3) wraps it — sharp reads the elevation
// raw grayscale, this bakes, writeLinearTier tiers + writes the PNG.
export function bakeNormalMap(
  height: { readonly data: Uint8Array; readonly width: number; readonly height: number },
  exaggeration: number,
): { data: Buffer; info: { width: number; height: number; channels: 4 } };
```

**Encoding contract (format — the shader in Task 4 MUST reconstruct to match this, byte-for-byte in intent):**

| Channel | Value                         | Notes                                                                |
| ------- | ----------------------------- | -------------------------------------------------------------------- |
| R       | `round((nx*0.5 + 0.5) * 255)` | tangent-space X, along **+u (east)** — the tangent axis plan A emits |
| G       | `round((ny*0.5 + 0.5) * 255)` | tangent-space Y, along **+v** (bitangent)                            |
| B       | `255`                         | spare (a neutral `+z` hint)                                          |
| A       | `255`                         | spare (opaque)                                                       |

where `(nx, ny, nz) = normalize(vec3(-gx * exaggeration, -gy * exaggeration, 1))`, `gx`/`gy` the Sobel gradients of the heightfield (per-texel height difference).

- **Edge handling (essential geometry, not a special case):** the heightfield is equirectangular — **wrap in x** (longitude seam; column `-1 ≡ width-1`) so no spurious gradient smears the ±180° meridian, and **clamp in y** (poles). This mirrors the sampler's `addressModeU:'repeat'` / `addressModeV:'clamp-to-edge'` (`earthRenderer.ts:165-166`) so the baked map and the runtime sample agree at the seam.
- **The G sign is load-bearing.** Whether increasing row index means north or south, and the resulting sign of `gy`, must match the mesh's `+v` / bitangent orientation and the `flipY:true` texture upload (`earthRenderer.ts:309`) so relief catches light on the **correct** side of a ridge. Document the chosen row convention in the module header; the sign is the one thing verified visually in Task 5.
- Named tunable const: `DEFAULT_EXAGGERATION` (the gradient gain — Earth's real relief is imperceptible at true scale, so it is deliberately amplified). No adaptive machinery.

**Steps (TDD):**

- [x] Write `tests/tools/textures/bakeNormalMap.test.ts` with **hand-computed** expectations (independent of the implementation — not a mirror):
  - [x] `a flat heightfield bakes to the neutral normal` — every-texel-equal input ⇒ every output pixel `R ≈ 128, G ≈ 128, B = 255` (fails if the gradient reports nonzero on flat ground — the commonest kernel bug).
  - [x] `a +x ramp tilts R, not G, with the downhill sign` — height increasing a fixed step per column ⇒ all interior pixels share ONE `RG`, with `G ≈ 128` and `R` on the **hand-derived** side of 128 (assert the exact `<` or `>` — that pins the sign). Fails on axis swap, wrong sign, or a non-constant result.
  - [x] `a +y ramp tilts G, not R` — the symmetric case ⇒ `R ≈ 128`, `G` off-neutral. Catches an x/y axis swap the +x test alone can't.
  - [x] `exaggeration scales the tilt monotonically` — the same +x ramp at `exaggeration` 2× vs 1× ⇒ `|R − 128|` strictly larger at 2× (independent monotonicity property; fails if exaggeration is ignored or misapplied).
  - [x] `the longitude seam does not fabricate a gradient` — a heightfield varying only in y (constant across each row, equal at column 0 and `width-1`) ⇒ the seam columns' `R ≈ 128` (no spurious x-gradient from mishandling the wrap). Fails if x-edges clamp instead of wrap.
- [x] Implement `bakeNormalMap`; didactic header explaining the Sobel kernel, the RG encoding + Z-reconstruction split, the equirect wrap/clamp edge rule, and the row/sign convention.
- [x] `npm test -- bakeNormalMap` green; `npx tsc --noEmit -p tsconfig.tools.json` clean.
- [x] Commit (`tools/textures/bakeNormalMap.ts`, its test).

---

## Task 2: Elevation raw source + `normal` joins the linear axis

**Files:**

- Modify `tools/utils/io/rawDataRegistry.ts` (elevation source row)
- Modify `src/utils/scene/isLinearTextureKind.ts` + `tests/utils/scene/isLinearTextureKind.test.ts`
- Modify `data/raw/textures/README.md` (provenance for the elevation heightmap)

**Interfaces — Consumes:** `isLinearTextureKind` (plan A Task 7). **Produces:** the `'textures.earthElevation'` raw-data key + `normal` recognised as linear.

- **`rawDataRegistry` row `'textures.earthElevation'`:** modeled on `'textures.nasaBmng'` (`rawDataRegistry.ts:582-592`) — `kind:'file'`, `source:'gitignored'`, `upstream` = the confirmed GEBCO/SRTM downsampled-proxy URL, `fetcher:'tools/fetch/fetchTextures.ts'`, `readme:'textures.readme'`, `description` naming the dataset + native dims + that it is a **build-only bake input, never shipped**. **Verify the exact URL + native pixel dims live before writing the row** (the fetch task, Task 5, confirms it). The `.sha256` sidecar + README are already covered by the committed globs — no `.gitignore` edit.
- **`isLinearTextureKind`:** add `'normal'` alongside `'material'` — it is the **second** linear kind. Do NOT fork a predicate. This single edit propagates to the filename ext (`bodyTextureFilename.ts:35-37`), the fetch decode (`bodyTextureFetcher` `colorSpaceConversion:'none'`), and the GPU format (`earthRenderer.setMap` `rgba8unorm`) — all three consumers plan A already routes through this one home.
- **README:** add the elevation row to the provenance table (upstream URL, licence, native dims, "bake input — not a runtime texture", checksum-pending). Covered by the `!/data/raw/**/README.md` glob — plain `git add`.

**Steps (TDD):**

- [x] Extend `isLinearTextureKind.test.ts`: assert `normal is linear` and keep `surface/night/clouds are not` (hand-listed structural predicate driving three consumers' correctness — not a constant restatement). `material` stays linear.
- [x] Add the `'textures.earthElevation'` registry row + the README provenance line.
- [x] `npm test -- isLinearTextureKind` green; `npx tsc --noEmit -p tsconfig.tools.json` + `npx tsc --noEmit` clean.
- [x] Commit (stage each path explicitly).

---

## Task 3: The `normal` build path — bake wired into the per-kind writer

**Files:**

- Modify `tools/utils/io/textureSources.ts` (`earth.normal` source row)
- Modify `src/data/bodies/bodyTextureRegistry.ts` (`earth.kinds.normal`)
- Modify `tools/textures/buildTextures.ts` (the `normal` writer branch)

**Interfaces — Consumes:** `bakeNormalMap` (Task 1), `writeLinearTier` (plan A Task 7), the `(body,kind)` build loop + per-kind writer dispatch (plan A Task 6/7). **Produces:** `earth-normal-{2048,4096}.png` from the elevation source.

- **`TEXTURE_SOURCES.earth`:** add `normal: { native: 'textures.earthElevation' }` (`textureSources.ts:68`, the `earth` entry). **No `dev` variant** (full-pull-only, like `material`). This is the wrinkle made concrete: the `native` names the **elevation** input, not the normal map's own pixels — the row _shape_ is identical to `material`'s, only the build writer differs.
- **`BODY_TEXTURE_REGISTRY.earth`:** add `normal: 'medium'` to `kinds` (`bodyTextureRegistry.ts:56`) — the **4K ceiling** (spec §9.2). This one edit auto-mints the runtime slot + `ASSET_WIRING` proximity row + fetcher URL via `ALL_BODY_TEXTURE_KEYS` (`bodyTextureKeys.ts:22-29`); the runtime `setMap('normal', …)` stays inert until Task 4, so the proximity loader fetching `earth-normal-4096.png` is harmless (Earth renders from the surface map meanwhile).
- **build writer branch:** in the rewired body loop (`buildTextures.ts:208-228`), dispatch `kind === 'normal'` to: read the elevation source to a **single-channel raw** buffer via `sharp(src).greyscale().raw()`, run `bakeNormalMap(height, DEFAULT_EXAGGERATION)`, then write each tier via `writeLinearTier` (NOT `writeBodyTier` — no sRGB, PNG output; NOT the material channel-repack — the gradient bake). `emittedTiersForBody('earth','normal')` caps at `medium`. Bake **once** at (a capped) source resolution, let `writeLinearTier` resize per tier — a normal map downsamples cleanly. A kind whose source is absent on disk must **log-and-skip** (matches the existing per-body skip at `buildTextures.ts:210-213`), so a `--dev` build with no elevation fetched degrades gracefully rather than crashing.

**Steps:**

- [x] Add the `TEXTURE_SOURCES.earth.normal` + `BODY_TEXTURE_REGISTRY.earth.kinds.normal` rows; add the `normal` writer branch to the build loop; add the missing-source skip for a kind.
- [x] The plan A Task-6 drift tests (`textureBuildEntries covers every non-ring (body,kind)`, `the full pull covers every (body,kind) native`) now automatically exercise `normal` — run `npm test -- buildTextures fetchTextures textureSources` and confirm they stay green (the source is covered by the single table; no new drift test needed — the generic guard already binds).
- [x] `npx tsc --noEmit -p tsconfig.tools.json` clean.
- [x] Commit (stage each path explicitly).

---

## Task 4: Runtime — tangent VBO, `VSOut.tangent`, normal sample + perturb

**Files:**

- Modify `src/services/gpu/shaders/bodies/earth/io.wesl` (`VSOut.tangent` varying)
- Modify `src/services/gpu/shaders/bodies/earth/vertex.wesl` (tangent attribute + forward)
- Modify `src/services/gpu/shaders/bodies/earth/fragment.wesl` (sample RG, reconstruct Z, perturb normal)
- Modify `src/services/gpu/renderers/bodies/earthRenderer.ts` (tangent VBO, binding 5, `setMap('normal')`, placeholder)

**Interfaces — Consumes:** the cubesphere `tangents` (plan A emits them; this plan uploads them), the `pbr.wesl` shading path + `EarthSurfaceUniforms` fragment (plan A Task 8), `isLinearTextureKind` (Task 2). **Produces:** the perturbed shading normal fed to `pbrDirect`. `EarthSurfaceUniforms` is **unchanged** (exaggeration is baked, no runtime scalar).

- **`VSOut` (`earth/io.wesl:27-35`):** add `@location(2) tangent: vec3<f32>` — the interpolated unit local-space **+u (east)** tangent. Additive; `uv`@0 and `normalLocal`@1 (plan A reuses `normalLocal` as both normal and surface position) are unchanged.
- **`earth/vertex.wesl` (`:39-45`):** add the `@location(2) tangent: vec3<f32>` vertex-attribute input and forward it to `out.tangent` (raw — the fragment Gram-Schmidt-re-orthonormalizes after interpolation). Uniform type stays plan A's `EarthSurfaceUniforms`.
- **`earth/fragment.wesl`:** add `@group(0) @binding(5) var normalTexture: texture_2d<f32>;` (after plan B's binding-4 night texture; see plan A's canonical binding table — A material=3, B night=4, C normal=5, D clouds=6). Replace the plain `n = normalize(in.normalLocal)` with the TBN perturbation (contract — the reconstruction MUST match Task 1's encoding; body verified visually, not unit-tested):

  ```wgsl
  let nEnc = textureSample(normalTexture, earthSampler, in.uv).rg; // LINEAR RG
  let nxy  = nEnc * 2.0 - 1.0;
  let nz   = sqrt(max(0.0, 1.0 - dot(nxy, nxy)));                   // reconstruct Z
  let Ng   = normalize(in.normalLocal);
  let T    = normalize(in.tangent - Ng * dot(Ng, in.tangent));     // Gram-Schmidt
  let Bt   = cross(Ng, T);                                          // bitangent = +v
  let n    = normalize(T * nxy.x + Bt * nxy.y + Ng * nz);          // shading normal
  ```

  `n` then feeds `pbrDirect(n, v, l, …)` in place of the geometric normal. Single-quote WESL comments, no backticks.

- **`earthRenderer` — tangent VBO:** concatenate the six cubesphere faces' `tangents` alongside positions/uvs (the mesh assembly plan A added), upload to a third VBO (slot 2, `arrayStride:12`, `float32x3`, `shaderLocation:2`), add the buffer layout entry beside slots 0/1 (`earthRenderer.ts:250-259`), and `pass.setVertexBuffer(2, tangentBuffer)` in `draw` (`earthRenderer.ts:327-329`). `destroy` releases it.
- **`earthRenderer` — binding 5 + placeholder + `setMap('normal')`:** add binding 5 (fragment, `sampleType:'float'`) to the layout (`earthRenderer.ts:196-215`) and `buildBindGroup` (`earthRenderer.ts:219-229`); create a **1×1 flat-normal placeholder** at construction (`rgba8unorm` LINEAR, bytes `[128,128,255,255]` → tangent-space `(0,0,1)` = no relief), mirroring the material placeholder (plan A). Add a `normal` case to `setMap` (`earthRenderer.ts:286-319`): create a fresh texture, format `rgba8unorm` (LINEAR — chosen via `isLinearTextureKind(kind)`, the same predicate plan A's `material` case uses), upload, `generateMipChain`, rebuild the bind group. Keep `night`/`clouds` inert (plans B/D).

**Steps:**

- [x] Wire the varying, both shaders, the tangent VBO, binding 5, the flat-normal placeholder, and the `setMap('normal')` case.
- [x] `npx tsc --noEmit` clean; `npm run build` clean (WESL links — watch the iOS-strict traps; use `createShaderModuleWithDevLog` output if it fails).
- [x] **Visual check (placeholder normal, before Task 5 data):** ask the user to confirm on the running dev server (do not start/kill it) that Earth still renders correctly — with the flat-normal placeholder the shading is **identical to plan A** (no relief yet), no crash, terminator intact, ocean glint unchanged.
- [x] Commit (stage each path explicitly).

---

## Task 5: Fetch + bake the elevation map, then verify terminator relief

**Files:** none (data + verification). Produces `data/raw/textures/<elevation>` (gitignored) and `public/data/images/textures/earth-normal-{2048,4096}.png` (gitignored build artefacts).

- [x] **Announce the download** (announce-big-downloads): tell the user the GEBCO/SRTM elevation proxy is ~10–30 MB, state the exact URL + size confirmed against `textures.earthElevation`, and **get explicit go-ahead before fetching**. Do not fetch otherwise.
- [x] On go-ahead, fetch the elevation source (`npm run fetch-textures -- --confirm`, or a targeted single-source fetch) — it lands via `downloadGetOnly` into `data/raw/textures/` and upserts its `textures.sha256` line + README fetch date.
- [x] Build the normal tiers: `npm run build-textures` emits `earth-normal-4096.png` (+ `-2048`) via the Task 3 bake path. Confirm the files exist and are PNG.
- [x] **Visual check (the acceptance win):** ask the user to fly close to Earth at a **grazing sun angle** and confirm **terminator relief** — mountain ranges (Andes, Himalaya, Rockies) catch light on their sun-facing slopes and cast micro-shadow on the far slopes, with the effect strongest near the terminator and vanishing at local noon. Confirm relief tilts the **correct** way (the Task 1 G-sign): if ridges look inverted (valleys lit, peaks dark) the `gy` sign is flipped — fix in `bakeNormalMap` and rebuild. Confirm the network tab shows `earth-normal-4096.png` (not a 404 to the flat placeholder).
- [x] No commit (all artefacts gitignored). Note for the merge: R2 sync of `earth-normal-*.png` is a post-merge deploy step (spec §9.3 — the dir glob sweeps it), not part of this PR.

---

## Task 6: entanglement-radar review pass

**Files:** none (review).

- [x] Run the `entanglement-radar` skill over the whole branch diff (house convention). Pay attention to: `isLinearTextureKind` genuinely staying the **single home** for the sRGB-vs-linear axis (filename ext + fetch decode + GPU format — `normal` must add zero new sites); the baked-vs-fetched `normal` path living **only** in the build's per-kind writer branch (no new fetch/build iteration branch, no parallel source table or filename site); the bake's RG encoding and the shader's Z-reconstruction being one agreed format contract; the equirect wrap/clamp edge rule being essential geometry, not an accidental special case. Name any knot precisely and fix or file it before the final review.
- [x] Address findings (or record why deferred); keep the suite green.

---

## Task 7: Final review + verification

**Files:** none.

- [x] Run `npm test` (full suite green), `npm run typecheck` (both tsconfigs), `npm run build`.
- [x] Request code review (`superpowers:requesting-code-review`) covering the `bakeNormalMap` gradient/sign correctness (its hand-computed tests), the bake↔shader encoding agreement, and the single-seam baked-kind derivation.
- [x] Confirm the DoD before marking the plan done (`/feature-done`), which sweeps the backlog + relocates spec/plan on merge.

---

## Interfaces produced for later plans

Plans D/E build on plan A's uniform + wiring shapes; plan C adds only the following, and **claims no uniform pad slots** (both `EarthSurfaceUniforms._pad0` and `_pad1` remain free for plan D — exaggeration is baked offline, no runtime normal-strength scalar).

**`bakeNormalMap`** (`tools/textures/bakeNormalMap.ts`):
`bakeNormalMap(height: { data: Uint8Array; width: number; height: number }, exaggeration: number) → { data: Buffer; info: { width; height; channels: 4 } }`. Pure Sobel-gradient of a single-channel equirect heightfield → linear RG tangent-space normal (`R = nx·0.5+0.5`, `G = ny·0.5+0.5`, `B=A=255`), `nz` reconstructed in-shader from `sqrt(1 − nx² − ny²)`. Equirect edges: **wrap in x**, **clamp in y**. The FIRST derived/computed build output — every prior output is a straight resize.

**`(earth, 'normal')` derived build shape** (the pattern for any future baked-from-a-different-source kind):

- `TEXTURE_SOURCES.earth.normal = { native: 'textures.earthElevation' }` — `native` names the **bake input** (a different physical quantity), not the map's own pixels; row shape identical to a fetched kind.
- `BODY_TEXTURE_REGISTRY.earth.kinds.normal = 'medium'` (4K ceiling) → auto-mints slot + `ASSET_WIRING` proximity row + fetcher URL.
- On-disk name `earth-normal-<px>.png` via `bodyTextureFilename` (linear kinds → PNG through `isLinearTextureKind`).
- `isLinearTextureKind` now recognises **two** kinds (`material`, `normal`) — still the single sRGB-vs-linear home; PNG ext, `colorSpaceConversion:'none'` decode, `rgba8unorm` GPU format all follow.
- Divergence from a fetched kind lives **only** in the build's per-kind writer: `normal → bakeNormalMap + writeLinearTier` (a gradient of a different source), vs `material → channel-repack + writeLinearTier` (the source's own pixels). Fetch + iteration are unbranched.

**Runtime normal-mapping seam** (Earth surface fragment): `VSOut.tangent` (`@location(2)`, unit local +u/east) is uploaded from the cubesphere tangents and used with the geometric normal to build a TBN that transforms the sampled tangent-space normal (RG + reconstructed Z) into the local frame fed to `pbr.wesl`. `earthRenderer` binding 5 = the normal texture (per plan A's canonical binding table: A material=3, B night=4, C normal=5, D clouds=6); `setMap('normal', …)` uploads it as `rgba8unorm`.
