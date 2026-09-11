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

## The pre-bake — what `build-meshes` actually reads

`MESH_SOURCES.perseverance` points at `perseverance.prebaked.glb`, **not** the
download: the source carries 47 materials, is over the triangle budget, and
ships **stowed**. `buildMeshes` refuses multi-material input by design, so the
flattening happens upstream, once:

```
npm run prebake-mesh -- perseverance    # Blender 5.2 LTS; ~20 s, not run in CI
```

`tools/meshes/prebake/meshPrebake.py` evaluates the scene at **frame 120**,
drops the `Icosphere` ground helper, joins the 68 remaining parts, decimates
199,482 → 100,000 tris, smart-UV-projects and bakes all 47 materials into one
2048² albedo atlas. Its output and the loose
`perseverance.prebaked.albedo.png` beside it are gitignored build products —
regenerate them, don't archive them. Having no normal or metallicRoughness map
is expected: `buildMeshes` substitutes 1×1 constants and records
`normalMapSubstituted: true`.

**The frame is load-bearing.** The file's saved transforms park the rover with
its remote-sensing mast folded flat on the deck (bbox tops out at 1.85 m). The
deploy animation raises it over frames 0→48 and re-stows it after ~338, so any
frame in 48–290 gives the mast-up rover at its real 2.23 m height. Baking the
saved pose would ship a headless rover.

## Attribution

NASA content is not copyrighted and needs no permission for informational use,
but NASA asks that its material not imply endorsement, and its insignia are
protected separately — see <https://www.nasa.gov/nasa-brand-center/images-and-media>.
`npm run build-meshes` copies the string below onto the generated
`MESH_ASSETS.perseverance` row:

> Mars 2020 Perseverance Rover by Brian Kumanchik, NASA/JPL-Caltech — NASA 3D Resources, public domain (https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/)

## As inspected (2026-09-11)

glTF 2.0, Draco-compressed: 69 mesh nodes, 199,601 tris, 47 materials, 22
packed textures (1024²/512²/256²), an armature and 23 animation actions
(mast deploy plus cover releases). Normal maps ARE authored on several
materials; the pre-bake does not carry them into a second atlas, so the runtime
gets a flat normal.

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
