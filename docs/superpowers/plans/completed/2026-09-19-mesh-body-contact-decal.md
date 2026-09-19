# Mesh-body contact decal — plan

Spec: `docs/superpowers/specs/completed/2026-09-19-mesh-body-contact-decal-design.md`.
Branch `mesh-body-contact-decal` (off main 41e3952e8), one PR, prep commit first.

Strategy: the frame-order split (Task 1) is behaviour-neutral and lands first. The data
path (Tasks 2–3) is inert until the pass (Task 5) draws it; the matrices (Task 4) are
pure and tested alone. Task 5 is the only visible change and adds the `FRAME_ORDER`
marker. Task 6 re-runs `build-meshes`, measures the split, and gets the eye-check.

## Global constraints

- Body rows are reversed-Z with an infinite far plane: depth 0 = far/sky, clear value
  0 (`slabs.ts:104-107,199-203`). `foreground:0` depth is `depth32float`, no MSAA,
  already `RENDER_ATTACHMENT | TEXTURE_BINDING` (`renderTargets.ts:403-419`).
- Every pose matrix is composed in f64 and narrowed only at the uniform write
  (`composeMeshMvp.ts`, `narrowMat4`).
- Frame files declare only their own symbol (`frameFilePurity.test.ts`): helpers go to
  `src/utils/`, constants to `src/data/`.
- One symbol per `utils/` and `@types/` file; `type`, never `interface`.

## Task 1 (prep): a foreground body roster can split around a depth-sampling pass

**review: yes** (frame program)

**Files:** `src/@types/engine/frame/ForegroundStepSpec.d.ts`,
`src/@types/engine/frame/DepthSampledPasses.d.ts` (new),
`src/services/engine/frame/expandFrameOrder.ts`,
`src/services/engine/frame/checkFrameOrder.ts`,
`src/services/engine/frame/frameOrderPassNames.ts`,
`src/services/engine/frame/passSlabOf.ts`,
`tests/services/engine/frame/expandFrameOrder.test.ts`

**Contract:**

```ts
// DepthSampledPasses.d.ts
export type DepthSampledPasses = { readonly sampleDepth: readonly string[] };
// ForegroundStepSpec
readonly bodyPasses: readonly (string | DepthSampledPasses)[];
```

**Behaviour** (`expandFrameOrder.ts:98-105`, body rows only; NEAR0 rows unchanged):
split `bodyPasses` at each marker. Per body slab emit, in order: the passes before the
first marker with `depth: 'clear'`; each marker's passes with `depth: 'sample'` and
`slot: 'SAMPLE_DEPTH_<i>'`; each run of passes after a marker with `depth: 'load'` and
`slot: 'AFTER_DEPTH_<i>'` (i = marker index, 0-based). The first segment keeps no slot
(it owns the bare group key). An empty segment emits no step. A roster without a marker
expands exactly as today — one `'clear'` step, no slot. Timing slots need no change:
`timedSlotRowsOf` derives them from the expanded program.

`checkFrameOrder`, `frameOrderPassNames`, `passSlabOf` read `bodyPasses` as names —
flatten markers there (a marker's passes count as drawn, exactly once).

- [x] Test `a depth-sampling marker splits a body row into clear, sample and load`:
      roster `['a', { sampleDepth: ['d'] }, 'b']`, one body slab → three steps with
      passes `[a] / [d] / [b]`, depths `clear / sample / load`, slots
      `undefined / SAMPLE_DEPTH_0 / AFTER_DEPTH_0`.
- [x] Test `a marker at the end emits no empty load step`.
- [x] Test `a NEAR0 chain entry ignores the body roster's marker` (its step is the
      near0 roster, one `clear` step).
- [x] Existing expand/check/boot tests stay green unchanged (no marker in `FRAME_ORDER`).
- [x] Commit `refactor(frame): a foreground body roster can split around a depth-sampling pass`.

## Task 2: `buildMeshes` ships the decal

**Files:** `src/@types/data/mesh/ContactDecal.d.ts` (new), `tools/meshes/buildMeshes.ts`,
`tools/meshes/meshAssetRowFields.ts`, `tests/tools/meshes/buildMeshes.test.ts`

**Contract:**

```ts
export type ContactDecal = { readonly centre: Vec3; readonly halfU: Vec3; readonly halfV: Vec3 };
// MeshAssetRow gains
readonly contactDecal?: ContactDecal;
```

**Behaviour:**

- Read the node `extras.contactDecal {centre, u, v}` (glTF frame, metres) beside
  `readGroundUpStamp` (`buildMeshes.ts:~445`). Present without `aoGroundUp`, or the
  reverse → throw naming the key.
- Body frame: `centre' = bodyFromSource·centre − centroid`, `halfU' = bodyFromSource·u`,
  `halfV' = bodyFromSource·v` — the same remap `mergeGeometry` applies to vertices
  (`:312`) and the same area-weighted centroid it subtracts (`:380-392`; return the
  centroid from `mergeGeometry` rather than recomputing). Absent `bodyFromSource` =
  identity.
- Write `<outDir>/<key>_contact.png`, single channel (`toColourspace('b-w')`), from
  `<glbPath minus .glb>.contact.png` (the prebake writes `<key>.prebaked.contact.png`
  beside `<key>.prebaked.glb`), resized into `TEXTURE_SIZE_BUDGET`. Missing file with a
  stamp → throw.
- `MESH_ASSET_ROW_FIELDS` gains `contactDecal`; an absent value emits no line (the
  generated rows stay byte-identical for floating keys).

- [x] Test `carries the contact decal into the body frame`: a stamped fixture with a
      non-identity `bodyFromSource` and an off-origin centroid, so dropping either the
      remap or the shift fails; assert the row's centre/halfU/halfV and that
      `testmesh_contact.png` exists with one channel.
- [x] Test `refuses a contact decal without a ground stamp`.
- [x] Commit `feat(meshes): ship the contact decal and its box in the body frame`.

## Task 3: fetch and upload the decal texture

**Files:** `src/@types/data/mesh/MeshAsset.d.ts`,
`src/services/loading/fetchers/meshFetcher.ts`,
`src/services/gpu/renderers/bodies/meshBodyRenderer.ts`,
`src/@types/rendering/MeshBodyRenderer.d.ts`,
`tests/services/gpu/renderers/bodies/meshBodyRenderer.test.ts`

**Contract:** `MeshAsset.contactShadow?: ImageBitmap`. The fetcher reads
`MESH_ASSETS[req.meshKey].contactDecal`; when present it fetches
`meshes/<key>_contact.png` in the same `Promise.all`, decoded linear
(`colorSpaceConversion: 'none'`). `setMesh` uploads it as `r8unorm`
(`copyExternalImageToTexture`) into the body's entry; `clearMesh` destroys it.

- [x] Renderer test `uploads a contact shadow as r8unorm and frees it on clear`, in
      the style of the existing texture assertions in `meshBodyRenderer.test.ts`.
- [x] No fetcher test: a routing change the eye-check covers.
- [x] Commit `feat(meshBody): load the contact-shadow texture with the mesh`.

## Task 4: the decal's matrices

**review: yes** (pose maths)

**Files:** `src/utils/camera/composeContactDecalMatrices.ts` (new),
`src/data/bodies/contactShadowHalfHeightM.ts` (new),
`tests/utils/camera/composeContactDecalMatrices.test.ts` (new)

**Signature:**

```ts
composeContactDecalMatrices(
  slabVp: Float64Array, posM: Readonly<Vec3>, eyeRelBodyM: Readonly<Vec3>,
  rotM: Readonly<Mat3>, decal: ContactDecal,
): { boxToClip: Float64Array; clipToBox: Float64Array }
```

`boxToClip = composeMeshMvp(slabVp, posM, eyeRelBodyM, rotM) · B`, where `B` maps the
unit cube [-1,1]³ onto the box: columns `halfU`, `halfV`,
`normalize(halfU × halfV) · CONTACT_SHADOW_HALF_HEIGHT_M`, translation `centre`.
`clipToBox = inverse(boxToClip)`. `CONTACT_SHADOW_HALF_HEIGHT_M = 0.25`.

- [x] Test `clipToBox inverts boxToClip`: product ≈ identity (1e-9).
- [x] Test `the box centre projects to the cube origin`: the decal centre (body frame)
      through `composeMeshMvp(...)` to clip, then `clipToBox`, divided by w → ≈ (0,0,0).
- [x] Test `the box's up axis is the ground normal`: `B`'s third column is parallel to
      `halfU × halfV`, length 0.25 — a swapped cross product fails.
- [x] Test `keeps the round trip tight far from the origin`: `eyeRelBodyM` and `posM`
      ~3.4e6 m (a Mars surface site), rover 20 m from the eye → a ground point maps into
      the cube within 1e-6.
- [x] Commit `feat(meshBody): compose the contact decal's box and inverse matrices`.

## Task 5: the contact-shadows pass

**review: yes** (shader, TS↔WGSL contract)

**Files:** `src/services/gpu/shaders/bodies/contactShadow/{io,vertex,fragment}.wesl`
(new), `src/services/gpu/renderers/bodies/meshBodyRenderer.ts` (second pipeline +
`drawContactShadow`), `src/utils/gpu/packContactShadowUniforms.ts` (new),
`src/services/engine/frame/passes/contactShadowsPass.ts` (new),
`src/services/engine/frame/passes/index.ts`, `src/services/engine/frame/frameOrder.ts`,
`src/services/gpu/renderTargets.ts` (stale comment `:111-113` only)

**Uniforms** (group 0 binding 0, 128 B):

| Offset | Field       | Type          |
| ------ | ----------- | ------------- |
| 0      | `boxToClip` | `mat4x4<f32>` |
| 64     | `clipToBox` | `mat4x4<f32>` |

**Bindings:** group 0 — b0 uniforms, b1 contact texture `texture_2d<f32>`, b2 sampler
(linear, clamp-to-edge), b3 `texture_depth_2d` (`ctx.renderTargets.depthViewOf('foreground:0')`;
rebuild the bind group when that view changes, e.g. on resize).

**Pipeline:** colour target = `foreground:0`'s format, NO `depthStencil` (a `'sample'`
step attaches no depth); `cullMode: 'front'` (back faces: works with the eye inside the
box); blend colour `srcFactor: 'dst', dstFactor: 'zero'`, `writeMask` RGB only (alpha
is the overlays' transmittance). No vertex buffer: 36 cube vertices from
`@builtin(vertex_index)`, consistent outward winding.

**Fragment:** `d = textureLoad(depth, vec2<i32>(fragXY), 0)`; `d == 0` → discard.
`ndc = (fragXY / textureDimensions(depth)) · (2, −2) + (−1, 1)`;
`p = clipToBox · vec4(ndc, d, 1)`; `p.xyz /= p.w` (finite, since d > 0); any
`|p| > 1` → discard. `shade = mix(1, textureSample(contact, uv = p.xy·0.5+0.5).r,
1 − smoothstep(0.5, 1, |p.z|))`; output `vec4(shade, shade, shade, 1)`. Sample with
`textureSampleLevel(…, 0)` (non-uniform control flow after discard).

**Pass** `contact-shadows`: `enabled` = body-m row and at least one
`drawableMeshBodies` entry with a resident contact texture. `draw` walks those bodies
with the same pose reads as `meshBodiesPass.ts:56-94` (`bodyStateInHostFrame`,
`ctx.bodyPose(hostId)`), composes via Task 4, narrows at the uniform write.

**`FRAME_ORDER`** (`frameOrder.ts:~216`): insert `{ sampleDepth: ['contact-shadows'] }`
after `'terrain-pick-marker'`; extend the roster comment by one line on why (depth holds
the ground; rover and haze come after). Add the pass to `CONTENT_PASSES`.

- [x] naga validation of the linked shader (scratch `dumpWgsl` route as in #758).
- [x] No new unit test: the gate and draw are plumbing; Task 4 carries the maths, the
      eye-check carries the rest.
- [x] Commit `feat(meshBody): draw each seated rover's contact shadow on the terrain`.

## Task 6 (controller): data, measurement, eye-check

- [x] `npm run build-meshes` (writes `_contact.png` + rows into main's `public/data`
      via the symlink), then rebuild main's manifest (scratch `manifestMain.ts`).
- [x] `npm run perf -- --url http://localhost:5173` before (Task 1 commit) and after
      (Task 5) at a rover site; record the delta in the PR body.
- [x] User eye-check, f.lux off: Curiosity, Perseverance, Spirit, Opportunity.

## Definition of Done

- Deliverables: `DepthSampledPasses` marker + split expansion; `ContactDecal` row field
  and `<key>_contact.png` for curiosity/perseverance/mer; `MeshAsset.contactShadow`;
  `composeContactDecalMatrices`; `contact-shadows` pass + shader; `FRAME_ORDER` marker.
- Observable: a soft dark footprint under each of the four rovers; all six wheels sit
  in it; the rover's own pixels are not darkened; the footprint stays put as terrain
  LOD changes and as the camera enters the box; floating meshes and Earth unchanged.
- Measured: `npm run perf` delta for the row split, stated in the PR.
- Out of scope: sun shadows (stage 2), a general decal stage, decals in probe
  captures, R2 sync (main session, after merge).
