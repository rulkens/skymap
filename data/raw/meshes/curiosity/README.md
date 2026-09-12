# Curiosity rover — raw source model

The Mars Science Laboratory rover in the mesh-body layer. A NASA 3D Resources
download: **gitignored**, same posture as the planet textures — only this README
and the checksum sidecar (`../meshes.sha256`) are committed. Registered as
`meshes.curiosityArchive` / `meshes.curiositySource` in
`tools/utils/io/rawDataRegistry.ts`; the pre-baked `meshes.curiosity` beside
them is what `npm run build-meshes` reads.

| Field      | Value                                                              |
| ---------- | ------------------------------------------------------------------ |
| Model      | "Curiosity Rover (MSL) (Clean)"                                    |
| Author     | Brian Kumanchik, NASA/JPL-Caltech                                  |
| Source     | <https://science.nasa.gov/3d-resources/curiosity-rover-msl/>       |
| Licence    | Public domain — NASA 3D Resources are "free and without copyright" |
| Fetch date | 2026-09-11                                                         |
| File       | `Curiosity Rover (MSL) (Clean).zip`, 6,123,157 bytes               |
| sha256     | `d48c61a9f2e6873ce4662706f49470edb4f040b7374750ab59f990b3ecc2a836` |

The archive holds one file, `Curiosity Rover (MSL) (Clean).blend` (10,231,670
bytes, sha256 `77fe6665223e38972728af404f1a277f0b0ab467fce5cc0aed6eba93488b74e2`),
which is what the pre-bake opens. A "(Dirty)" dust-weathered variant exists on
the same page; the clean one is what ships.

## How to obtain

```
curl -L -o "data/raw/meshes/curiosity/Curiosity Rover (MSL) (Clean).zip" \
  "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/curiosity-rover-(msl)/Curiosity%20Rover%20(MSL)%20(Clean).zip"
unzip -o "data/raw/meshes/curiosity/Curiosity Rover (MSL) (Clean).zip" \
  -d data/raw/meshes/curiosity/
```

Verify with `shasum -c meshes.sha256` from `data/raw/meshes/`.

## The pre-bake — what `build-meshes` actually reads

`MESH_SOURCES.curiosity` points at `curiosity.prebaked.glb`, **not** the
download: the source is a 106-object Blender scene with 18 materials, nine
cameras and two lights, and `buildMeshes` reads GLB with one material. The
flattening happens upstream, once:

```
npm run prebake-mesh -- curiosity    # Blender 5.2 LTS; ~10 s, not run in CI
```

`tools/meshes/prebake/meshPrebake.py` evaluates the scene at **frame 206**,
drops the camera markers and the `pivot` / `shadow2` helper geometry, joins the
73 remaining parts, applies their geometry-nodes modifiers, smart-UV-projects
and bakes all 16 surviving materials into one 2048² albedo atlas. Its output
and the loose `curiosity.prebaked.albedo.png` beside it are gitignored build
products — regenerate them, don't archive them. Having no normal or
metallicRoughness map is expected: `buildMeshes` substitutes 1×1 constants and
records `normalMapSubstituted: true`.

Three things about this file bite:

- **The helper geometry is not cosmetic.** `_root_p` is a 1 m cube at the origin
  and `shadow_arm` a 2 m ground plane; both carry a material, so a "drop meshes
  with no material" rule misses them and they end up baked into the rover.
  They go by material name (`pivot`, `shadow2`) instead.
- **Two colour maps arrive flagged Non-Color**, so the renderer skips the sRGB
  decode and the rover bakes out washed to white. The pre-bake re-flags anything
  feeding Base Color as sRGB.
- **One texture reference is dangling** — a duplicate `tex_03.png` that resolves
  to nothing and would bake black over twelve parts. The pre-bake re-points it
  at the packed original.

## Attribution

NASA content is not copyrighted and needs no permission for informational use,
but NASA asks that its material not imply endorsement, and its insignia are
protected separately — see <https://www.nasa.gov/nasa-brand-center/images-and-media>.
`npm run build-meshes` copies the string below onto the generated
`MESH_ASSETS.curiosity` row:

> Curiosity Rover (MSL) by Brian Kumanchik, NASA/JPL-Caltech — NASA 3D Resources, public domain (https://science.nasa.gov/3d-resources/curiosity-rover-msl/)

## As inspected (2026-09-11)

Blender 4.02 file: 95 mesh objects, 48,638 tris, 18 materials, 6 packed
textures (1024²), 73 animation actions. No armature; the rig is object
parenting through marker cubes.

**Units: metres, +Z up.** The scene's unit system reads `NONE`, but the wheels
measure 0.485 m across against the real 0.5 m and the mast tops out 2.21 m above
the wheel contact plane against the real 2.2 m, so the model is authored in
metres and feeds the bake with no rescale. At frame 206 the bounding box spans
2.78 × 3.94 × 2.21 m — wider than the real rover's 2.7 m and longer than its
2.9 m only because the robotic arm is extended forward.

Axes **in the pre-baked GLB** (glTF Y-up):

| Feature                                            | Direction |
| -------------------------------------------------- | --------- |
| Up (mast, deck)                                    | +Y        |
| Forward (mast cameras, robotic arm, front hazcams) | +Z        |
| Rear (RTG, radiators)                              | −Z        |
| Across (left/right wheel pairs)                    | ±X        |

Wheels sit on the −Y side, their contact plane through the origin; `buildMeshes`
then recentres the geometry on its area-weighted surface centroid.
