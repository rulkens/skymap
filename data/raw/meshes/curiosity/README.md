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

## The `.blend` — the edited source

`curiosity.blend` is what the pre-bake opens — not the download above, nor
the zip's own `Curiosity Rover (MSL) (Clean).blend`, which the importer reads
and never writes back to. Written by Blender 5.2 LTS, it does not open in
older versions. Re-import it at any time with `npm run import-mesh --
curiosity` (Blender 5.2 LTS, not run in CI) — this **overwrites any edits**
made since the last import.

The download is a 106-object Blender scene with 18 materials, nine cameras
and two lights. `tools/meshes/prebake/importMesh.py` evaluates it at **frame
206**, applies the geometry-nodes modifiers hanging off a dozen parts, and
freezes every remaining part's world transform (dropping the marker-cube rig,
so the pre-bake's `join` needs no parenting). It also repairs three source
defects:

- **The helper geometry is not cosmetic.** `_root_p` is a 1 m cube at the
  origin and `shadow_arm` a 2 m ground plane; both carry a material, so a
  "drop meshes with no material" rule misses them and they would bake into the
  rover. The importer drops them by material name (`pivot`, `shadow2`)
  instead, leaving 16 materials.
- **Two colour maps arrive flagged Non-Color**, so the renderer skips the sRGB
  decode and the bake would come out washed to white. The importer re-flags
  anything feeding Base Color as sRGB.
- **One texture reference is dangling** — a duplicate `tex_03.png` that
  resolves to nothing and would bake black over twelve parts. The importer
  re-points it at the packed original.

It also collapses the mixed UV-layer names onto one shared layer and
re-points every Normal Map node at it, and drops seven rival Material Output
nodes — targeted at Cycles and each fed by a bare Diffuse BSDF, they win over
the Principled the file renders with; left in, those parts would bake black
albedo (a Diffuse node emits nothing) and roughness 1.

To edit the model: open `curiosity.blend` in Blender 5.2 LTS at frame 206,
change materials, save, update this file's line in `../meshes.sha256`, then
`npm run prebake-mesh -- curiosity` and `npm run build-meshes`.

## The pre-bake — what `build-meshes` actually reads

`MESH_SOURCES.curiosity` points at `curiosity.prebaked.glb`, **not**
`curiosity.blend`: the source carries 16 materials and `buildMeshes` reads GLB
with one material. The flattening happens upstream, once:

```
npm run prebake-mesh -- curiosity    # Blender 5.2 LTS; ~10 s, not run in CI
```

`tools/meshes/prebake/meshPrebake.py` joins the 73 remaining parts (leaving
behind any face-less/materialless leftovers, such as the camera markers),
smart-UV-projects and bakes all 16 materials into one 2048² atlas per
`BAKE_PASSES` row — albedo, normal, roughness and metallic. Its output and the
four loose `curiosity.prebaked.*.png` atlases beside it are gitignored build
products — regenerate them, don't archive them. The GLB carries the normal
atlas and the metallicRoughness pair the glTF exporter packs from the last
two; `substituted: []` on the generated row is the check that the exporter
still packs them. Every material authors metallic 0, so that atlas bakes flat
black. Roughness is 0.5 over 83 % of the baked texels, 0.1–0.4 over most of
the rest, and 1.0 on a sliver of about 10,800 texels.

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
