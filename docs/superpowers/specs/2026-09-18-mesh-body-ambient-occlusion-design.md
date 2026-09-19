# Mesh-body baked ambient occlusion — design

Effort A of `docs/backlog/2026-09-18-mesh-body-ambient-occlusion.md`, plus the bake
half of effort B: the contact decal's texture. Drawing the decal stays in the backlog.

## Goal

Mesh bodies lit only by the probe look flat: crevices, the underside of a rover deck,
the inside of a dish all receive the full environment light. Bake ambient occlusion
into the unused R channel of the existing `_mr` texture and use it to attenuate the
environment term only — never the direct sun. Seated rovers bake against a ground
plane, so their undersides darken the way a body resting on the ground does.

## Data delta

- **`_mr` texture:** R = AO (1 = unoccluded), G = roughness, B = metallic, which is
  glTF's own ORM layout. No new texture slot, binding or format field.
- **Prebaked GLB:** the glTF material gains an `occlusionTexture`. The Blender 5.2
  exporter packs same-size Occlusion, Roughness and Metallic images into one image
  (`io_scene_gltf2/blender/exp/material/materials.py:409-446`), so
  `occlusionTexture` and `metallicRoughnessTexture` name the same image.
- **Ground fact:** a node `extras.aoGroundUp: [x, y, z]` on seated keys' prebaked GLB:
  the ground's up in the SOURCE frame the plane was baked against. Absent = baked
  without a ground plane.
- **Contact decal (seated only):** `data/raw/meshes/<key>/<key>.prebaked.contact.png`,
  the ground plane's own AO with the body as occluder (1 = unshadowed), over the
  plane's UV square. Placement: node `extras.contactDecal: {centre, u, v}`, source
  frame, metres: the plane's centre and its half-side vectors along UV u and v. A
  raw prebake product only; the runtime does not read it until effort B.

## Where the ground fact comes from

It is scene data, not a bake setting. A mesh key is seated when a body in
`SCENE_MESH_BODIES` with that `meshKey` has a `SURFACE_FIXED_SITES` row. Its ground up
is body +Z (the up column `rotationSurfaceLocked` builds) carried into the source frame:
`transpose(bodyFromSource) · [0, 0, 1]`. That comes to +Y for all three rovers today,
but nothing in Python assumes it.

A key shared by a seated body and a floating body throws. No such key exists today:
`mer` backs Spirit and Opportunity, both on Mars.

## Shape

```
tools/utils/meshes/meshGroundUpSource.ts   (meshKey) => Vec3 | undefined — the rule above
tools/meshes/prebakeMesh.ts                driver: key → spawns Blender with
                                           `-- <key> [--ground-up x,y,z]`
package.json   "prebake-mesh" → tsx tools/meshes/prebakeMesh.ts (Blender path via
               $BLENDER as today)

meshPrebake.py
  BAKE_PASSES rows carry their own samples (prep); new row:
    ("occlusion", dict(type="AO"), "Non-Color", None) with its own sample count
  main():
    parse optional --ground-up
    world AO distance = AO_DISTANCE_FRACTION × largest extent from bounds(obj)
    ground plane (seated only): created after join_meshes, at the model's bottom along
      the ground up, side (1 + 2·AO_DISTANCE_FRACTION) × largest extent — nothing
      beyond the AO distance can occlude; not selected during the body rows; then
      baked itself (AO, body as occluder) → the contact decal; removed before
      flatten_materials
  flatten_materials: occlusion atlas → the glTF Material Output group's Occlusion input
  export: stamp extras.aoGroundUp and extras.contactDecal; export_extras on

buildMeshes.ts
  refuse a key whose GLB stamp ≠ meshGroundUpSource(key)  ("re-run prebake-mesh <key>")
  _mr R: kept only when occlusionTexture is the MR texture, else 255;
         fallback metalRough r: 0 → 255

meshBody/fragment.wesl   read `.rgb` of metalRoughTexture; pass ao to envSplitSum
lib/pbr.wesl envSplitSum(…, ao)
  diffuse  × ao
  specular × saturate(pow(NoV + ao, exp2(-16·rough - 1)) - 1 + ao)   (Lagarde)
```

The stamp check is what makes the TS-side rule the single source of truth: adding a
rover site without re-baking its mesh fails `build-meshes` instead of shipping a mesh
AO-baked as a floating body.

## Not changed

- Direct sun lighting and shadows are untouched.
- Whale (no prebake) and petunias (own prebake script) get R = 255: no AO, identical
  to today.
- The plane is flat in the source frame; terrain slope is still the runtime
  `SITE_GROUND_UPS_ENU` tilt (#756).

## Ground preparation

Refactor-ground checkpoint posted and ruled 2026-09-18.

| Touchpoint | Verdict |
| --- | --- |
| `BAKE_PASSES` AO row | bolt-on today: `bake_pass` hardcodes `scene.cycles.samples = 1` (`meshPrebake.py:246`) → **prep:** rows carry their samples |
| AO distance from model size | growth: Cycles' AO bake reads the scene-level world AO distance, set once in `main()` from `bounds(obj)` (already computed, `:354`). No row needs the object. |
| Occlusion into `_mr` | growth: exporter packing (verified), plus the R rule in `buildMeshes.ts:474` |
| `envSplitSum` `ao` | growth: one caller (`fragment.wesl:58`) |
| Seated fact | growth: new pure function + driver; no existing list gains an entry |

Prep: one commit, `BAKE_PASSES` rows carry their own sample count (behaviour-neutral:
every existing row keeps 1). Ruled: rides the feature PR as its first commit.

Rulings: seated fact from TS scene data via the driver + GLB stamp (not a Python
flag); exporter packing + force 255 (not an explicit composite); ground plane present
for the whole bake (harmless to the EMIT/normal/roughness rows, which trace nothing
and never select it).

Adjacent findings, backlogged: two prebake scripts (petunias has its own), so AO for
petunias means folding it into `meshPrebake.py` first; whale has no prebake at all.

## Verification

- `meshGroundUpSource`: rovers give source +Y; a floating key gives undefined; a mixed
  key throws.
- The `buildMeshes` R rule: an MR texture whose R is garbage and no occlusionTexture
  gives R = 255.
- Re-bake voyager, perseverance, curiosity, mer, hubble; `build-meshes`; user eye-check
  (f.lux off): rover undersides and dish interiors darken, sunlit faces unchanged.
- R2 sync from the main session after merge; main's manifest must be rebuilt before a
  linked worktree sees the re-bake.
