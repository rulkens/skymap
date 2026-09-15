# Mars Exploration Rover — raw source model

Spirit and Opportunity are the same vehicle, so both mesh bodies draw this one
model. A NASA 3D Resources download: **gitignored**, same posture as the planet
textures — only this README and the checksum sidecar (`../meshes.sha256`) are
committed. Registered as `meshes.merSource` in
`tools/utils/io/rawDataRegistry.ts`; the pre-baked `meshes.mer` beside it is
what `npm run build-meshes` reads.

| Field      | Value                                                                                  |
| ---------- | -------------------------------------------------------------------------------------- |
| Model      | "Mars Exploration Rover - Spirit and Opportunity"                                      |
| Author     | NASA/JPL-Caltech                                                                       |
| Source     | <https://science.nasa.gov/3d-resources/mars-exploration-rover-spirit-and-opportunity/> |
| Licence    | Public domain — NASA 3D Resources are "free and without copyright"                     |
| Fetch date | 2026-09-11                                                                             |
| File       | `Mars Exploration Rover - Spirit and Opportunity.blend`, 12,243,528 bytes              |
| sha256     | `1f1e2b246aca461d6d1d2b5f9ac9dff7fd225d242fc000131277457815e160c2`                     |

## How to obtain

The download link on the NASA page **404s** (checked 2026-09-11), so the file
comes from NASA's own GitHub mirror of the same collection:

```
curl -L -o "data/raw/meshes/mer/Mars Exploration Rover - Spirit and Opportunity.blend" \
  "https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Mars%20Exploration%20Rover%20-%20Spirit%20and%20Opportunity/Mars%20Exploration%20Rover%20-%20Spirit%20and%20Opportunity.blend"
```

Verify with `shasum -c meshes.sha256` from `data/raw/meshes/`.

## The `.blend` — the edited source

`mer.blend` is what the pre-bake opens, not the download above. Written by
Blender 5.2 LTS, it does not open in older versions. Re-import it at any time
with `npm run import-mesh -- mer` — this **overwrites any edits** made since
the last import.

`tools/meshes/prebake/importMesh.py` evaluates the 63-object scene at **frame
1325** before saving. The frame is load-bearing: the deploy animation starts
with the rover in its folded landing configuration (solar panels shut, 1.28 m
wide, mast down) and only reaches the deployed rover — panels out to 2.28 m,
Pancam mast at 1.58 m — past frame ~530; saving frame 0 would ship a folded
rover. The importer then freezes every part's world transform at that frame;
parenting is untouched. It also renames each part's UV layer onto the shared
layer name, re-flags all seven colour maps (which arrive flagged Non-Color)
as sRGB so the bake doesn't wash out, and drops two rival Material Output
nodes — targeted at Cycles and each fed by a bare Diffuse BSDF, they win over
the Principled the file renders with; left in, those parts would bake black
albedo (a Diffuse node emits nothing) and roughness 1.

Every joint hangs off a material-less marker cube, and those cubes stay in
the file as parents: the pre-bake omits them from the join, and its
`parent_clear` keeps each freed part's transform — which is what lets the
cubes go without detaching the wheels and panels they carry.

To edit the model: open `mer.blend` in Blender 5.2 LTS, change materials,
save, update this file's line in `../meshes.sha256`, then
`npm run prebake-mesh -- mer` and `npm run build-meshes`.

## The pre-bake — what `build-meshes` actually reads

`MESH_SOURCES.mer` points at `mer.prebaked.glb`, **not** `mer.blend`: the
source carries nine materials and `buildMeshes` reads GLB with one material.
The flattening happens upstream, once:

```
npm run prebake-mesh -- mer    # Blender 5.2 LTS; ~10 s, not run in CI
```

`tools/meshes/prebake/meshPrebake.py` leaves the 21 material-less marker
cubes behind, joins the 40 remaining parts, smart-UV-projects and bakes all
nine materials into one 2048² atlas per `BAKE_PASSES` row — albedo, normal,
roughness and metallic. Its output and the four loose `mer.prebaked.*.png`
atlases beside it are gitignored build products — regenerate them, don't
archive them. The GLB carries the normal atlas and the metallicRoughness pair
the glTF exporter packs from the last two; `substituted: []` on the generated
row is the check that the exporter still packs them. Every material authors
metallic 0, so that atlas bakes flat black. Roughness is 0.5 over 90 % of the
baked texels and 0.1–0.4 over the rest.

## Attribution

NASA content is not copyrighted and needs no permission for informational use,
but NASA asks that its material not imply endorsement, and its insignia are
protected separately — see <https://www.nasa.gov/nasa-brand-center/images-and-media>.
`npm run build-meshes` copies the string below onto the generated
`MESH_ASSETS.mer` row:

> Mars Exploration Rover - Spirit and Opportunity by NASA/JPL-Caltech — NASA 3D Resources, public domain (https://science.nasa.gov/3d-resources/mars-exploration-rover-spirit-and-opportunity/)

## As inspected (2026-09-11)

Blender 4.02 file: 61 mesh objects, 32,814 tris, nine materials, 13 packed
textures (1024²/512²/256²), 38 animation actions. No armature. Normal maps are
packed in the file but wired into nothing, so nothing carries them and the
normal atlas bakes flat.

**Units: metres, +Z up.** The scene's unit system reads `NONE`, but at frame
1325 the deployed solar array spans 2.28 m against the real 2.3 m and the
Pancam mast tops out 1.58 m above the wheel contact plane against the real
1.5 m, so the model is authored in metres and feeds the bake with no rescale.
Bounding box 2.28 × 1.65 × 1.58 m.

Axes **in the pre-baked GLB** (glTF Y-up):

| Feature                                        | Direction |
| ---------------------------------------------- | --------- |
| Up (Pancam mast, solar deck)                   | +Y        |
| Forward (Pancam, instrument arm, front wheels) | +Z        |
| Rear (rear solar panel, rear wheels)           | −Z        |
| Across (deployed solar wings, wheel pairs)     | ±X        |

Wheels sit on the −Y side, their contact plane through the origin; `buildMeshes`
then recentres the geometry on its area-weighted surface centroid.
