# Mesh-body contact decal — design

Draws the contact shadow #758 already bakes: the soft dark footprint under each seated
rover, projected onto the terrain as drawn. Stage 1 of
`docs/backlog/2026-09-12-mesh-body-shadows.md`; that item keeps stage 2 (sun shadows).

## Goal

A rover on Mars floats visually: nothing darkens the ground where its wheels touch.
The prebake's ground-plane AO (`<key>.prebaked.contact.png`, 1 = unshadowed) is that
darkening, sun-independent. Put it on the terrain under each seated rover without a
quad at an offset (z-fighting, LOD mismatch) and without coupling to the terrain
shaders.

Ruled 2026-09-19: a **projected box decal** (rasterise a box, read scene depth,
reconstruct the ground point, multiply-blend), **contact-shadow specific** (no general
decal stage), drawn **between the terrain and everything after it** in the body row
(option B: the row's pass splits around a depth-reading pass).

## Data delta

- **`MeshAssetRow.contactDecal?: ContactDecal`**
  `ContactDecal = { centre: Vec3; halfU: Vec3; halfV: Vec3 }`, body frame, metres:
  the GLB's `extras.contactDecal` put through the same `bodyFromSource` remap and
  centroid shift `buildMeshes` applies to the vertices. Absent = the mesh has no decal
  (floating keys). Present exactly when `extras.aoGroundUp` is — `buildMeshes` throws
  otherwise.
- **`public/data/meshes/<key>_contact.png`**: the prebake's contact PNG, greyscale,
  written by `buildMeshes` for keys with a `contactDecal`.
- **`MeshAsset.contactShadow?: ImageBitmap`**: fetched in the same batch as the other
  maps when the row has a `contactDecal`. Not a `MESH_TEXTURE_SLOTS` row — those are
  the mesh shader's bindings, and it never reads this texture.
- **`CONTACT_SHADOW_HALF_HEIGHT_M`** (`src/data/`): the box's half-extent along the
  ground normal `normalize(halfU × halfV)`, 0.25 m. Set by how far the drawn terrain
  can stray from the bake's flat plane (seat error, drawn-post stride), not by the
  model — so one constant, not a row field.

## Shape

```
tools/meshes/buildMeshes.ts
  read extras.contactDecal beside aoGroundUp; remap centre/halfU/halfV
  write <key>_contact.png (single channel)
tools/meshes/meshAssetRowFields.ts     + contactDecal column (optional → omitted)
src/@types/data/mesh/ContactDecal.ts   the type
src/services/loading/fetchers/meshFetcher.ts   fetch _contact.png when the row has one
src/services/gpu/meshBodyRenderer.ts
  setMesh: upload contactShadow as r8unorm into the body's entry; clearMesh frees it
  drawContactShadow(pass, id, uniforms, depthView)   second pipeline, same owner as
                                                      the texture's lifecycle
src/utils/camera/composeContactDecalMatrices.ts
  f64: boxToClip = slabVp · T(posM − eyeRelBodyM) · R(rotM) · B
       B = [halfU | halfV | n·CONTACT_SHADOW_HALF_HEIGHT_M | centre]
       clipToBox = inverse(boxToClip)            narrowed at the uniform write
src/services/engine/frame/passes/contactShadowsPass.ts
  enabled: body-m row with a drawable mesh body whose decal is resident
  draw: one unit-cube draw per such body
shaders/bodies/contactShadow/{io,vertex,fragment}.wesl
  vertex: unit cube × boxToClip, back faces only (the camera may be inside)
  fragment: d = textureLoad(depth, fragXY); d == 0 (reversed-Z far / sky) → discard
            p = clipToBox · (ndc.xy, d, 1); p /= p.w; outside [-1,1]³ → discard
            shade = mix(1, texture(uv = p.xy·0.5+0.5).r, 1 − smoothstep(0.5, 1, |p.z|))
  blend: colour × shade (src·dst), alpha write masked off
frameOrder.ts   bodyPasses: [earth, surface-tiles, terrain-pick-marker,
                             { sampleDepth: ['contact-shadows'] },
                             cloud-shell, planets, textured-bodies, rings,
                             atmosphere-shell, mesh-bodies]
```

Order matters on both sides. After the terrain, so depth holds the ground; before
`mesh-bodies`, so the rover's own pixels are never darkened; before `atmosphere-shell`,
so aerial perspective lands over the shadow, not under it.

Multiplying the lit colour darkens direct sun as well as ambient under the rover. That
is physically slightly wrong (a contact shadow is ambient occlusion) and accepted: there
is no G-buffer to separate the two, and under a rover the sun is mostly blocked anyway.

## Ground preparation

Refactor-ground checkpoint posted and ruled 2026-09-19 (option B).

| Touchpoint                         | Verdict                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Depth readable mid-row             | **bolt-on today**: a foreground line expands to ONE render step per chain row with depth attached (`expandFrameOrder.ts:98-104`), so no pass in `bodyPasses` can sample it → **prep** |
| Depth texture bindable             | growth: already `RENDER_ATTACHMENT \| TEXTURE_BINDING` (`renderTargets.ts:416`); the header comment at `:111-113` says otherwise — fix it                                             |
| `depth: 'sample'` / `'load'` steps | growth: both exist in `executeFrame` (`depthLoadOpFor`), unused by the foreground line                                                                                                |
| An empty decal step costs nothing  | growth: a step whose passes all gate off opens no pass (`executeFrame.ts:224-227`)                                                                                                    |
| Row field, fetch, renderer, pass   | growth: a column in `MESH_ASSET_ROW_FIELDS`, an optional fetch, a second pipeline, a `CONTENT_PASSES` entry                                                                           |

**Prep (own commit, behaviour-neutral):** `ForegroundStepSpec.bodyPasses` accepts a
`{ sampleDepth: readonly string[] }` entry. Per body row the expansion emits the passes
before it with `depth: 'clear'`, the marker's passes with `depth: 'sample'`, and the
rest with `depth: 'load'`, each step with its own timing `slot` so the row's group key
is not billed twice. No marker in `FRAME_ORDER` yet, so the expansion is unchanged.

Cost of the split once the marker lands: every body row pays one more pass boundary
(the segment after the marker always opens; the decal step opens only where a decal
draws). One store + load of `foreground:0` colour and depth per row — `npm run perf`
before and after.

Adjacent (fixed here, not new work): the stale `renderTargets.ts:111-113` comment.

## Not changed

- The bake. `contact.png` and `extras.contactDecal` ship as #758 left them.
- Probe captures (`capture` line) draw no decal.
- Sun shadows (stage 2 of the shadows item).

## Verification

- `buildMeshes`: a stamped decal comes out remapped and centroid-shifted (a fixture
  whose remap and shift both move it, so dropping either fails); a decal without a
  ground stamp throws.
- `expandFrameOrder`: a marker splits one body row into clear → sample → load with
  distinct slots; a roster without a marker expands exactly as before.
- `composeContactDecalMatrices`: `clipToBox · boxToClip` = identity; the box centre
  lands at the origin; a far-from-origin eye keeps the round trip within 1e-6.
- WGSL: naga validation of the new shader.
- `npm run perf` A/B for the row split.
- R2 sync of the `_contact.png` files after merge.
- User eye-check (f.lux off) at all four sites: a soft footprint under each rover, all
  six wheels touching it, nothing darkened on the rover itself, no seam as terrain LOD
  changes.
