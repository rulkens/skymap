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

## The pre-bake — what `build-meshes` actually reads

`MESH_SOURCES.mer` points at `mer.prebaked.glb`, **not** the download: the
source is a 63-object Blender scene with nine materials and two lights, and
`buildMeshes` reads GLB with one material. The flattening happens upstream,
once:

```
npm run prebake-mesh -- mer    # Blender 5.2 LTS; ~10 s, not run in CI
```

`tools/meshes/prebake/meshPrebake.py` evaluates the scene at **frame 1325**,
leaves the 21 material-less marker cubes behind, joins the 40 remaining parts,
smart-UV-projects and bakes all nine materials into one 2048² albedo atlas. Its
output and the loose `mer.prebaked.albedo.png` beside it are gitignored build
products — regenerate them, don't archive them. Having no normal or
metallicRoughness map is expected: `buildMeshes` substitutes 1×1 constants and
records `normalMapSubstituted: true`.

Two things about this file bite:

- **The frame is load-bearing.** The deploy animation starts with the rover in
  its folded landing configuration (solar panels shut, 1.28 m wide, mast down)
  and only reaches the deployed rover — panels out to 2.28 m, Pancam mast at
  1.58 m — past frame ~530. Baking frame 0 would ship a folded rover.
- **Every joint hangs off a material-less cube.** Those cubes are parents, so
  deleting them before the join detaches the wheels and panels and scatters the
  model; the pre-bake leaves them in place and simply omits them from the join.

All seven colour maps arrive flagged Non-Color, so the renderer skips the sRGB
decode and the rover bakes out washed; the pre-bake re-flags anything feeding
Base Color as sRGB.

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
packed in the file but wired into nothing, so nothing carries them; the
pre-bake bakes albedo only.

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
