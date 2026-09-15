# Perseverance rover — raw source model

The Mars 2020 rover in the mesh-body layer. A NASA 3D Resources download:
**gitignored**, same posture as the planet textures — only this README and the
checksum sidecar (`../meshes.sha256`) are committed. Registered as
`meshes.perseveranceSource` in `tools/utils/io/rawDataRegistry.ts`; the
pre-baked `meshes.perseverance` beside it is what `npm run build-meshes` reads.

| Field      | Value                                                                 |
| ---------- | --------------------------------------------------------------------- |
| Model      | "Mars 2020 Perseverance Rover"                                        |
| Author     | Brian Kumanchik, NASA/JPL-Caltech                                     |
| Source     | <https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/> |
| Licence    | Public domain — NASA 3D Resources are "free and without copyright"    |
| Fetch date | 2026-09-11                                                            |
| File       | `Mars 2020 Perseverance Rover.glb`, 4,987,176 bytes                   |
| sha256     | `10db7c03a5e63a5a3b3e7baa6243aa4918ba045fa8ff0a731d0217491adc727f`    |

## How to obtain

```
curl -L -o "data/raw/meshes/perseverance/Mars 2020 Perseverance Rover.glb" \
  "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/mars-2020-perseverance-rover/Mars%202020%20Perseverance%20Rover.glb"
```

Verify with `shasum -c meshes.sha256` from `data/raw/meshes/`.

## The `.blend` — the edited source

`perseverance.blend` is what the pre-bake opens, not the download above.
Written by Blender 5.2 LTS, it does not open in older versions. Re-import it
from the pristine download at any time with `npm run import-mesh --
perseverance` (Blender 5.2 LTS, not run in CI) — this **overwrites any edits**
made since the last import.

`tools/meshes/prebake/importMesh.py` evaluates the scene at **frame 120**
before saving. The frame is load-bearing: the file's saved transforms park the
rover with its remote-sensing mast folded flat on the deck (bbox tops out at
1.85 m); the deploy animation raises it over frames 0→48 and re-stows it after
~338, so any frame in 48–290 gives the mast-up rover at its real 2.23 m
height, while saving the default pose would ship a headless rover. The
importer then applies the armature deform on every part, freezes each part's
world transform at that frame (dropping the rig, so the pre-bake's `join`
needs no parenting), collapses the mixed UV-layer names onto one shared layer
and re-points every Normal Map node at it, re-flags any Base Color texture the
source left as Non-Color so it decodes sRGB, and collapses rival Material
Output nodes onto the one the file renders with. This download has none of
the defects these last three passes exist for, so they are no-ops here; the
importer runs them uniformly over every source.

To edit the model: open `perseverance.blend` in Blender 5.2 LTS at frame 120,
change materials, save, update this file's line in `../meshes.sha256`, then
`npm run prebake-mesh -- perseverance` and `npm run build-meshes`.

## The pre-bake — what `build-meshes` actually reads

`MESH_SOURCES.perseverance` points at `perseverance.prebaked.glb`, **not**
`perseverance.blend`: the source carries 47 materials and is over the
triangle budget. `buildMeshes` refuses multi-material input by design, so the
flattening happens upstream, once:

```
npm run prebake-mesh -- perseverance    # Blender 5.2 LTS; ~20 s, not run in CI
```

`tools/meshes/prebake/meshPrebake.py` joins the 68 remaining parts (leaving
behind any face-less/materialless leftovers, such as the `Icosphere` ground
helper), decimates 199,482 → 100,000 tris, smart-UV-projects and bakes all 47
materials into one 2048² atlas per `BAKE_PASSES` row — albedo, normal,
roughness and metallic. Its output and the four loose
`perseverance.prebaked.*.png` atlases beside it are gitignored build products
— regenerate them, don't archive them. The GLB carries the normal atlas and
the metallicRoughness pair the glTF exporter packs from the last two;
`substituted: []` on the generated row is the check that the exporter still
packs them.

## Attribution

NASA content is not copyrighted and needs no permission for informational use,
but NASA asks that its material not imply endorsement, and its insignia are
protected separately — see <https://www.nasa.gov/nasa-brand-center/images-and-media>.
`npm run build-meshes` copies the string below onto the generated
`MESH_ASSETS.perseverance` row:

> Mars 2020 Perseverance Rover by Brian Kumanchik, NASA/JPL-Caltech — NASA 3D Resources, public domain (https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/)

## As inspected (2026-09-11)

glTF 2.0, Draco-compressed: 69 mesh nodes, 199,601 tris, 47 materials, 22 packed
textures (1024²/512²/256²), an armature and 23 animation actions (mast deploy
plus cover releases). Authored normal maps reach the normal atlas only because
the pre-bake re-points the 11 Normal Map nodes that name a UV layer at the
renamed one; a dangling name bakes flat in silence. Roughness spans 0.2–1.0 and
about half the baked surface is fully metallic (aluminium, brass, gold foil,
gunmetal). Their tint reaches the albedo atlas only because that row bakes Base
Color through the emission output: Cycles' DIFFUSE colour pass of a metal is
zero by definition, and baked that way every metal texel is black.

**Units: metres, +Z up (Blender frame).** Wheels measure 0.526 m across against
the real 0.525 m, so the model feeds the bake in native metres with no rescale.
At frame 120 the bounding box spans 2.70 × 3.11 × 2.23 m (real rover: 3 m long,
2.7 m wide, 2.2 m tall) with the wheel contact patch at z = 0.

Axes **in the pre-baked GLB** (glTF Y-up):

| Feature                                            | Direction |
| -------------------------------------------------- | --------- |
| Up (mast, deck)                                    | +Y        |
| Forward (mast cameras, robotic arm, front hazcams) | +Z        |
| Rear (RTG, rear hazcams)                           | −Z        |
| Across (left/right wheel pairs)                    | ±X        |

Wheels sit on the −Y side, their contact plane through the origin; `buildMeshes`
then recentres the geometry on its area-weighted surface centroid.
