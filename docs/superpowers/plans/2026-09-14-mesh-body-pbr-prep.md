# Mesh-body PBR — prep P2–P5

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

## Goal

Four behaviour-identical refactors that give the PBR feature
(`2026-09-14-mesh-body-pbr.md`, same PR, later commits) joints to grow into
instead of bolt onto. Each is its own commit, sequenced before any feature
commit. Nothing here changes a pixel: the mesh bodies render exactly as on
`main`, the Earth ocean glint is untouched, and the four prebaked atlases come
out byte-identical.

## Architecture

- **P2** — `meshBodyRenderer` splits its one bind group into a per-body
  `@group(0)` (uniforms + the three material maps) and a global `@group(1)`
  (today: the sampler). The feature adds the BRDF LUT to group 1 and the
  reflection probe to group 0; neither then touches the other's lifetime.
- **P3** — `lib/pbr.wesl`'s `pbrDirect` takes `f0: vec3<f32>`. Every caller is
  a dielectric today and passes a splatted scalar; the metal/dielectric blend
  the feature builds in the mesh fragment then needs no second `pbrDirect`.
- **P4** — `meshPrebake.py` becomes a pass table (`BAKE_PASSES`, one row:
  albedo) with a per-pass image lifecycle, and `flatten_materials` links the
  baked images it is given. The feature adds three rows.
- **P5** — `meshFetcher` and `buildMeshes` derive file suffixes and decode
  colour-space from `MESH_TEXTURE_SLOTS`; `buildMeshes` serializes the
  generated row from one field descriptor; `substituted` (a list of slot
  fields) replaces `normalMapSubstituted`.

## Tech Stack

TypeScript + raw WebGPU + WESL; Vitest. Blender 5.2 LTS (user's machine, not
CI) for P4's gate. No new dependencies, no data-format change, no new assets.

## Spec

`docs/superpowers/specs/2026-09-12-mesh-body-pbr-design.md` — "Ground
preparation": blockers **J3–J6** under "Missing joints", prep list items
**P2–P5**, ruling **T1** (the #678 texture shape stays). P1 (keyed cubemap
captures) shipped on `main` in #697; read the shipped code, not the spec's
sketch.

Pre-reading for the implementer: `docs/RENDERER.md` (mandatory — renderer +
shader tasks), `docs/DATA.md` (mandatory — P4/P5 touch `tools/meshes` and
`data/raw`), `.claude/skills/wesl-shaders/SKILL.md` (P2/P3 edit `.wesl`),
`docs/superpowers/conventions/{comments,testing,simplicity,leanness,renderers}.md`.

## Global Constraints

- **Behaviour-identical.** No task changes what the GPU draws. P2/P3 are gated
  by the user's eye (ocean glint, a rover, Voyager unchanged) and a clean dev
  console; P4 by byte-identical prebake outputs; P5 by a clean `git diff`
  after a real `npm run build-meshes`.
- **Frame-file purity.** Any file under `src/services/engine/frame/` (incl.
  `timing/`, `passes/`) exports ONLY the symbol it is named for; helpers go to
  `src/utils/` or their own file, constants to `src/data/`.
  `tests/services/engine/frame/frameFilePurity.test.ts`'s `ALLOWED` rows are
  exact and only ever go down. (No task here should touch `frame/`; if one
  must, this rule applies.)
- **One symbol per file** in `src/utils/` and `src/@types/`; filename = symbol.
  `type` aliases, never `interface`. Deep relative imports, no barrels.
- **Comment budget:** module header ≤ 10 lines; comment lines ≤ half the code
  lines. Files already over budget get trimmed only where the task edits them
  anyway — no sweeps.
- **WESL:** single quotes in shader comments, never backticks; imports at the
  top, one identifier per line, `package::` prefix. Read the linked output via
  `createShaderModuleWithDevLog` in the dev console when a pipeline fails.
- **File moves/renames** go through `npm run move-files` (`--dry` first);
  symbol renames through `npm run refactor -- rename`. Spelled out per task.
- **Each task ends green** (`npm test`, `npm run typecheck`) and is one commit
  with the message given in the task.
- **Worktrees own `data/`.** P4/P5's real runs need the NASA sources and
  Blender, which live on the user's machine; those steps are marked
  **USER-RUN** and the implementer stops and asks rather than faking them.

## File Structure

### Created

```
src/@types/data/mesh/MeshTextureField.d.ts          'albedo' | 'metalRough' | 'normalMap'
tools/meshes/meshAssetRowFields.ts                  the one MeshAssetRow field descriptor
tests/services/gpu/renderers/bodies/meshBodyRenderer.test.ts
tests/tools/meshes/meshAssetsRoundTrip.test.ts
```

### Modified

```
src/services/gpu/renderers/bodies/meshBodyRenderer.ts     group(0) per body, group(1) global
src/@types/rendering/MeshBodyRenderer.d.ts                doc only
src/services/gpu/shaders/bodies/meshBody/fragment.wesl   sampler moves to group(1); vec3 f0
src/services/gpu/shaders/lib/pbr.wesl                     fresnelSchlick / pbrDirect f0: vec3
src/services/gpu/shaders/bodies/earth/fragment.wesl       vec3<f32>(u.f0)
src/services/gpu/shaders/bodies/earthSurfaceTile/fragment.wesl
src/data/mesh/meshTextureSlots.ts                         + suffix; field typed MeshTextureField
src/@types/data/mesh/MeshAsset.d.ts                       texture fields keyed by MeshTextureField
src/services/loading/fetchers/meshFetcher.ts              loops MESH_TEXTURE_SLOTS
src/data/bodies/meshAssets.generated.ts                   substituted replaces normalMapSubstituted
tools/meshes/buildMeshes.ts                               slot-driven textures; descriptor serializer
tools/meshes/prebake/meshPrebake.py                       BAKE_PASSES + per-pass image lifecycle
tests/tools/meshes/buildMeshes.test.ts                    substituted assertions
data/raw/meshes/{voyager,perseverance,curiosity,mer}/README.md   "one atlas" wording (P4)
```

---

## Task 1 (P2): `meshBodyRenderer` — a per-body group and a global group

**Files:** `src/services/gpu/renderers/bodies/meshBodyRenderer.ts`,
`src/services/gpu/shaders/bodies/meshBody/fragment.wesl`,
`src/@types/rendering/MeshBodyRenderer.d.ts` (doc),
`tests/services/gpu/renderers/bodies/meshBodyRenderer.test.ts` (new)

**Produces** (no public-type change; the split is the renderer's internal
shape and the shader's binding contract):

```wgsl
// meshBody/fragment.wesl — after
@group(0) @binding(0) var<uniform> u: MeshBodyUniforms;
@group(0) @binding(2) var albedoTexture: texture_2d<f32>;
@group(0) @binding(3) var metalRoughTexture: texture_2d<f32>;
@group(0) @binding(4) var normalTexture: texture_2d<f32>;
@group(1) @binding(0) var meshSampler: sampler;
```

Binding 1 of group 0 is left vacant on purpose: `MESH_TEXTURE_SLOTS`'
bindings (2/3/4) are data shared with the layout builder and renumbering them
buys nothing. The feature later fills group 0 binding 5 (probe cube) and
group 1 bindings 1–2 (LUT + its clamp sampler).

**Ruling on the spec's `bindProbe(bodyId, view | null)`:** not built. The
feature mints a body's probe texture in `setMesh`, beside its material maps,
with the same lifetime and the same `releaseResources` — so there is no
moment after `setMesh` at which a probe view arrives and needs re-binding, and
a `bindProbe` entry would have no caller once the feature lands. J3's real
blocker is the global group, which this task creates.

- [ ] Add `tests/services/gpu/renderers/bodies/meshBodyRenderer.test.ts` on
      the `texturedBodyRenderer.test.ts` mock-device pattern (record
      `createBindGroupLayout` / `createBindGroup` / `createBuffer` descriptors):
  - `it('mints two bind-group layouts: the per-body one carries the uniform + MESH_TEXTURE_SLOTS bindings and no sampler; the global one carries only the sampler')`
    — assert the per-body layout's entry bindings equal
    `[0, ...MESH_TEXTURE_SLOTS.map(s => s.binding)]` and no entry has
    `sampler`; the global layout has exactly one entry, `{ binding: 0, sampler }`.
  - `it('draw binds the body's own group at index 0 and the shared group at index 1')`
    — after `setMesh('a', asset)` and `setMesh('b', asset)`, `draw(pass, 'b', …)`
    calls `setBindGroup(0, <b's group>)` and `setBindGroup(1, <the global group>)`;
    the global group object is the same across both bodies' draws.
- [ ] Split `bindGroupLayout` into `bodyBindGroupLayout` (binding 0 uniform +
      the slot textures) and `globalBindGroupLayout` (binding 0 sampler);
      `bindGroupLayouts: [bodyBindGroupLayout, globalBindGroupLayout]`. Mint
      `globalBindGroup` once at factory time. `setMesh`'s group drops the
      sampler entry. `draw` sets both groups.
- [ ] `fragment.wesl`: move `meshSampler` to `@group(1) @binding(0)`; leave
      every other line untouched.
- [ ] `MeshBodyRenderer.d.ts` header: one sentence that group 1 is the
      renderer-wide material sampler and group 0 the body's own resources.
- [ ] `npm test -- meshBodyRenderer` green; `npm run typecheck`.
- [ ] **USER-RUN visual check:** dev server, fly to Curiosity (or the whale);
      the rover renders exactly as before; the dev console shows no
      `meshBody.fragment` compile error and no bind-group validation error.
- [ ] Commit: `refactor(mesh-bodies): per-body group(0) + global group(1) in meshBodyRenderer (PBR prep P2)`.

---

## Task 2 (P3): `pbrDirect` takes an RGB `f0`

**Files:** `src/services/gpu/shaders/lib/pbr.wesl`,
`src/services/gpu/shaders/bodies/earth/fragment.wesl:120`,
`src/services/gpu/shaders/bodies/earthSurfaceTile/fragment.wesl:116`,
`src/services/gpu/shaders/bodies/meshBody/fragment.wesl:50`

**Produces:**

```wgsl
fn fresnelSchlick(cosTheta: f32, f0: vec3<f32>) -> vec3<f32>;
fn pbrDirect(
  n: vec3<f32>, v: vec3<f32>, l: vec3<f32>,
  albedo: vec3<f32>, roughness: f32, f0: vec3<f32>,
) -> vec3<f32>;
```

`specular` inside `pbrDirect` becomes a `vec3<f32>`; the composition
`(diffuse + specular) * NoL` is otherwise unchanged. For every present caller
`f0` is a splatted scalar, so the arithmetic is identical per channel.

- [ ] Change the two signatures; `let specular = (D * G) * F / max(4.0 * NoV * NoL, 1e-4);`
      with `F: vec3<f32>`; return `(diffuse + specular) * NoL` — no
      `vec3<f32>(specular)` wrap any more.
- [ ] Callers: `pbrDirect(n, v, l, albedo, roughness, vec3<f32>(u.f0))` in both
      Earth fragments; `vec3<f32>(DIELECTRIC_F0)` in the mesh fragment. Its
      header sentence "A metal/dielectric blend, if ever wanted, is built HERE,
      not inside pbrDirect" now reads: the blend is built here, `pbrDirect`
      takes the blended `f0`.
- [ ] `pbr.wesl` header: delete the "No metalness … a scalar is the honest
      representation" bullet (it is now false) and shorten the `fresnelSchlick`
      docblock's scalar wording. Leave the rest of the file's commentary alone —
      it is over budget, but this task is not the sweep.
- [ ] `npm run build` (links every `?static` shader — a WESL syntax slip fails
      here; a WGSL type error does NOT, see the next step).
- [ ] **USER-RUN Earth ocean-glint parity:** dev server, `earth-surface`
      pose (`tools/perf/perfScenarios.ts`; reach it via the `?perf` hook's
      `setPose`, or fly there). Before/after screenshots of the sun glint on the
      ocean must be indistinguishable — same extent, same brightness, same
      terminator rim. Also check one rover and Voyager unchanged, and that the
      dev console logs no compile error for `earth`, `earthSurfaceTile` or
      `meshBody` fragments (WGSL type errors surface only in the browser).
- [ ] Commit: `refactor(shaders): pbrDirect takes an RGB f0 (PBR prep P3)`.

---

## Task 3 (P5): one texture-slot table, one row descriptor, `substituted`

**Files:** `src/@types/data/mesh/MeshTextureField.d.ts` (new),
`src/data/mesh/meshTextureSlots.ts`, `src/@types/data/mesh/MeshAsset.d.ts`,
`src/services/loading/fetchers/meshFetcher.ts`,
`tools/meshes/meshAssetRowFields.ts` (new), `tools/meshes/buildMeshes.ts`,
`src/data/bodies/meshAssets.generated.ts`,
`tests/tools/meshes/buildMeshes.test.ts`,
`tests/tools/meshes/meshAssetsRoundTrip.test.ts` (new)

**Produces:**

```ts
// src/@types/data/mesh/MeshTextureField.d.ts
export type MeshTextureField = 'albedo' | 'metalRough' | 'normalMap';

// src/data/mesh/meshTextureSlots.ts — one row per baked map
export const MESH_TEXTURE_SLOTS = [
  { field: 'albedo',     binding: 2, format: 'rgba8unorm-srgb', suffix: '_albedo' },
  { field: 'metalRough', binding: 3, format: 'rgba8unorm',      suffix: '_mr' },
  { field: 'normalMap',  binding: 4, format: 'rgba8unorm',      suffix: '_normal' },
] as const satisfies readonly {
  field: MeshTextureField; binding: number; format: GPUTextureFormat; suffix: string;
}[];
// Linear decode is derived: a slot whose format is not '-srgb' is data, not colour.

// src/data/bodies/meshAssets.generated.ts (generated — shape only)
export type MeshAssetRow = {
  …
  /** Slots `buildMeshes` filled with a 1×1 constant because the source had no map. */
  readonly substituted: readonly MeshTextureField[];
  …  // normalMapSubstituted is gone
};

// tools/meshes/meshAssetRowFields.ts — the ONE description of a row
export type MeshAssetRowField = {
  readonly name: keyof MeshAssetRow & string;
  readonly tsType: string;
  readonly doc?: readonly string[];            // emitted as a /** */ block
  readonly emit: (row: MeshAssetRow) => string; // the value's TS literal
};
export const MESH_ASSET_ROW_FIELDS: readonly MeshAssetRowField[];

// tools/meshes/buildMeshes.ts — exported for the round-trip test
export function serializeMeshAssets(rows: readonly MeshAssetRow[]): string;
```

- [ ] Add `MeshTextureField`; type `MeshAsset`'s three bitmap fields through it
      (`readonly [K in MeshTextureField]: ImageBitmap` intersected with the
      geometry fields, or the three explicit lines — either, as long as
      `MESH_TEXTURE_SLOTS[number]['field']` is assignable to it).
- [ ] `meshTextureSlots.ts`: add `suffix` per row (values above — these are the
      file names already on R2, so they cannot change).
- [ ] `meshFetcher.ts`: fetch `MESH_TEXTURE_SLOTS.map(slot => fetchTexture(dataUrl(`${prefix}${slot.suffix}.png`), signal, !slot.format.endsWith('-srgb')))`
      and assemble the asset by `slot.field`. The header's "three fixed roles"
      sentence goes; the colour-space rationale stays (one sentence).
- [ ] `buildMeshes.ts`: build a per-field `{ texture: Texture | null; fallback }`
      source map once (`albedo` ← base colour texture / `srgbByte(factor)`,
      `metalRough` ← MR texture / `{ r: 0, g: roughness, b: metallic }`,
      `normalMap` ← normal texture / `FLAT_NORMAL`), then write every slot in
      one loop over `MESH_TEXTURE_SLOTS` using `slot.suffix`. `substituted` =
      the slot fields whose source texture is `null`, in slot order. The two
      `console.warn`s become one loop over the substituted list.
- [ ] `meshAssetRowFields.ts`: one entry per row field in emitted order (`key`,
      `path`, `boundingRadiusM`, `groundOffsetM`, `meanAlbedo`, `triangleCount`,
      `substituted`, `source`, `licence`, `attribution`), carrying the docblock
      lines that today live in the hand-written type text (`groundOffsetM`'s
      three lines; `attribution`'s trailing comment becomes a doc line).
      `serializeMeshAssets` emits BOTH the `export type MeshAssetRow` block and
      each row's body from this list; the banner, the `Vec3` +
      `MeshTextureField` imports and the `MESH_ASSETS` wrapper stay literal.
      `field()`'s prettier-width break and `quote()` are unchanged.
- [ ] Regenerate `meshAssets.generated.ts` BY HAND to exactly what the new
      serializer emits (the round-trip test below is the check):
      `substituted: ['metalRough', 'normalMap']` for the five rows that carried
      `normalMapSubstituted: true` (their READMEs record no MR map either),
      `substituted: []` for `whale`. The real bake in Task 4 overwrites this
      file; any difference it produces is committed there.
- [ ] `tests/tools/meshes/meshAssetsRoundTrip.test.ts`:
      `it('the committed generated table is exactly what serializeMeshAssets emits for its own rows')`
      — `serializeMeshAssets(Object.values(MESH_ASSETS)) === readFileSync('src/data/bodies/meshAssets.generated.ts', 'utf8')`.
      This is a generator↔artifact contract (the format keep-rule), not a
      source grep: it fails when the file is hand-edited or the serializer
      changes without a rebake.
- [ ] `buildMeshes.test.ts`: the fixtures that asserted `normalMapSubstituted`
      now assert `substituted` (`[]` for a source with all three maps;
      `['metalRough', 'normalMap']` for one with base colour only). Add
      `it('writes every MESH_TEXTURE_SLOTS suffix, so a slot added to the table lands on disk')`
      — the out dir contains `<key>${slot.suffix}.png` for every slot.
- [ ] `grep -rn normalMapSubstituted src tests tools docs` → only the ledger
      under `plans/completed/` may still say it.
- [ ] `npm test -- meshes meshFetcher` green; `npm run typecheck` (both
      projects — `tools/` imports `src/data/mesh/meshTextureSlots`).
- [ ] Commit: `refactor(meshes): texture slots drive fetcher + bake; one row descriptor; substituted list (PBR prep P5)`.

---

## Task 4 (P4): `meshPrebake.py` — a bake-pass table with a per-pass image lifecycle

**Files:** `tools/meshes/prebake/meshPrebake.py`,
`data/raw/meshes/{voyager,perseverance,curiosity,mer}/README.md` (wording),
`src/data/bodies/meshAssets.generated.ts` (regenerated by the gate)

**Produces** (Python, the contract the feature's three rows grow into):

```python
# (name, bake kwargs, colourspace) — the one row today; the feature adds
# normal / roughness / metallic. `bake_pass` runs one row start to finish.
BAKE_PASSES = [
    ("albedo", dict(type="DIFFUSE", pass_filter={"COLOR"}), "sRGB"),
]

def atlas_path(cfg, name):            # data/raw/meshes/<key>/<key>.prebaked.<name>.png
def bake_pass(obj, uv_name, cfg, name, settings, colourspace):  # -> bpy Image, saved
def flatten_materials(obj, key, images):   # images: {name: Image}; links what it is given
```

`flatten_materials` links `images["albedo"]` to Base Color. **It keeps writing
Metallic 0 / Roughness 0.7 for the channels no row bakes yet** — those two
constants are the exported GLB's material factors, which `buildMeshes` turns
into the 1×1 `_mr.png` the runtime reads; dropping them here would change the
rovers' roughness (Blender's default is 0.5), which is exactly the pixel
change this task must not make. The feature deletes them together with the
rows that supersede them.

`arm_materials` creates one image node per material once and `bake_pass`
re-points `node.image` per row; `bake` becomes the per-row body
(`scene.render.bake.*` settings are per row where they differ — `use_pass_color`
is the DIFFUSE row's, not global). `source()` loses `atlas_path`.

- [ ] **USER-RUN baseline, BEFORE editing the script.** In the worktree, link
      every raw file `MESH_SOURCES` resolves from the main checkout (the
      worktree owns only the READMEs):
      `for f in "Voyager Probe (B).glb" …` — one `ln -s "/Users/rulkens/Development/js/skymap/data/raw/meshes/<key>/<file>" data/raw/meshes/<key>/` per source named in `tools/utils/io/rawDataRegistry.ts` (`meshes.*Source`, `meshes.whale`, `meshes.petunias`, the curiosity `.blend`), so the prebaked OUTPUTS land in the worktree's own dirs. Then
      `npm run prebake-mesh -- voyager` / `perseverance` / `curiosity` / `mer`
      with the UNMODIFIED script, and record
      `shasum -a 256 data/raw/meshes/*/*.prebaked.glb data/raw/meshes/*/*.prebaked.albedo.png > .superpowers/pbr-p4-baseline.sha256`.
      (Cycles at one sample with no lights is deterministic; so is the
      unwrap. A later mismatch is a lifecycle bug, not noise.)
- [ ] Refactor the script to the shape above. The `image.filepath_raw` /
      `file_format` / `save()` trio and the `colorspace_settings` line move into
      `bake_pass`; `main` loops `BAKE_PASSES` and passes the `{name: image}`
      dict to `flatten_materials`.
- [ ] Refresh the four READMEs' "bakes all three materials into one 2048²
      albedo atlas" sentence to name `BAKE_PASSES` as the list of atlases
      (still one row); no other README change.
- [ ] **USER-RUN gate.** Rerun the four prebakes with the refactored script;
      `shasum -a 256 -c .superpowers/pbr-p4-baseline.sha256` must report every
      file OK. Then `npm run build-meshes` and `git status`: the only diffs
      allowed are `meshAssets.generated.ts`'s `substituted` entries if Task 3's
      hand edit guessed a slot wrong (commit the regenerated file as truth;
      `public/data/meshes/` is gitignored and needs no action).
- [ ] `npm test -- meshes` green (the round-trip test now proves the
      regenerated table).
- [ ] Commit: `refactor(prebake): BAKE_PASSES table + per-pass image lifecycle (PBR prep P4)`.

---

## Out of scope (deferred to the feature plan)

- Any new bake row, LUT, probe, capture row, uniform field, or shader term.
- `bindProbe` (ruled out above), `setEnvBrdfLut` (the LUT arrives as a factory
  input of `createMeshBodyRenderer`, loaded in `initGpu` the way font atlases are).
- Deleting the two BSDF constants in `flatten_materials`.
- `petuniasPrebake.py` — stays a separate albedo-only script.
- R2 sync: no `public/data/meshes` byte changes, so nothing to sync.

## Definition of Done

**Deliverable inventory**

- `meshBodyRenderer` builds two bind-group layouts; the fragment reads the
  sampler from `@group(1) @binding(0)`.
- `pbrDirect` / `fresnelSchlick` take `f0: vec3<f32>`; no `f32` `f0` remains
  in any `.wesl` under `src/services/gpu/shaders/`.
- `MESH_TEXTURE_SLOTS` rows carry `suffix`; `meshFetcher` and `buildMeshes`
  contain no literal `_albedo` / `_mr` / `_normal`.
- `tools/meshes/meshAssetRowFields.ts` exists; `serializeMeshAssets` is
  exported and `tests/tools/meshes/meshAssetsRoundTrip.test.ts` pins the
  committed table to it.
- `MeshAssetRow.substituted: readonly MeshTextureField[]`; `normalMapSubstituted`
  survives only under `docs/superpowers/plans/completed/`.
- `meshPrebake.py` has `BAKE_PASSES`, `bake_pass`, `atlas_path`, and a
  `flatten_materials(obj, key, images)` that links from the dict.
- `.superpowers/pbr-p4-baseline.sha256` verified OK after the refactor (the file
  itself is git-ignored; the task's commit message records the verified run).

**Named observable behaviours (manual)**

1. Earth from the `earth-surface` pose: the ocean glint's extent, brightness
   and rim are indistinguishable before/after Task 2.
2. Curiosity on Mars and Voyager 1: lit exactly as on `main` after Tasks 1–2
   (same night-side floor, same host-shine tint on the underside).
3. Dev console: no shader-compile or bind-group validation message from any
   `earth*`/`meshBody` module across a boot + one visit to each of the above.
4. The four `*.prebaked.albedo.png` and `*.prebaked.glb` hash-identical across
   the P4 refactor; `npm run build-meshes` leaves the tree clean (modulo the
   `substituted` truth-up).

**Deferral boundary**

Everything under "Out of scope". No pixel changes anywhere; no new file under
`public/`.
