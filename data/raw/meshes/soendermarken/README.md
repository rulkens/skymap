# Søndermarken scan — raw source model

The 2019 leaf-on photogrammetry crop of Søndermarken drawn as a georeferenced
mesh body on Earth. **Gitignored**, same posture as the other mesh sources —
only this README and the checksum sidecar (`../meshes.sha256`) are committed.
Registered as `meshes.soendermarken` in `tools/utils/io/rawDataRegistry.ts`;
`MESH_SOURCES.soendermarken` (`tools/utils/io/meshSources.ts`) points
`npm run build-meshes` at it directly — no pre-bake, unlike the rigged/
multi-material sources beside it.

| Field      | Value                                                              |
| ---------- | ------------------------------------------------------------------- |
| Source     | scene-workbench group `soendermarken-crop-2019`, asset `mesh-cropped` |
| Licence    | CC BY 4.0 — attribute as **Skråfoto © Klimadatastyrelsen (CC BY 4.0)** |
| Copied     | 2026-09-25, from `public/data/geo3d/groups/soendermarken-crop-2019/assets/mesh-cropped/mesh.glb` |
| File       | `mesh.glb`, 21,841,896 bytes                                       |
| sha256     | `84951fe01e7def9f52f5155a8f60aac44603d15cedf3a3cd72a070960929021e` |

## How to obtain

Not a fetch: `tools/scene-workbench` bakes this asset from the flight
`skraafotos2019` (`data/raw/skraafoto/README.md`) — MVS-reconstructed by
COLMAP + OpenMVS, then cropped to the outline below. Copy its `mesh-cropped`
output here as `mesh.glb`:

```
cp "public/data/geo3d/groups/soendermarken-crop-2019/assets/mesh-cropped/mesh.glb" \
   "data/raw/meshes/soendermarken/mesh.glb"
```

Verify with `shasum -c meshes.sha256` from `data/raw/meshes/`. Re-baking the
workbench group (a new flight, a wider crop) changes the triangle count and
bounds below — update this file's line in `../meshes.sha256` afterwards.

## The crop outline

The hole `buildMeshes` cuts under this mesh comes from the SAME crop, not a
re-derived footprint:
[`data/geo3d/soendermarken-crop-2019/mesh.outline.json`](../../../geo3d/soendermarken-crop-2019/mesh.outline.json)
— a closed ring (`ringM`, 45 points) in the source's own ENU metres, committed
alongside the workbench group. `MESH_SOURCES.soendermarken.georeferenced.holeOutline`
names this path; `buildMeshes` shifts it by the same anchor→site translation
it applies to the mesh before rasterising it into the terrain mask.

## As inspected (2026-09-25)

glTF 2.0, one primitive, one material, `POSITION` + `TEXCOORD_0` only (no
`NORMAL` — `computeSmoothNormals` fills it in), one 8192² JPEG baseColor
texture. 343,395 vertices, **470,046 triangles**. The node transform is
identity: geometry is already in its authored frame, no bake to undo.

**Frame: ENU metres, +X east, +Y north, +Z up**, origin at the workbench
group's anchor — **55.67°N, 12.53°E, 18.53 m DVR90** (shared with the whole
crop group; not moved for this asset). The crop does not surround its origin:
x ∈ [−428.15, −211.66], y ∈ [−145.00, 106.05], z ∈ [7.43, 44.06] — the park is
~216 × 251 m, centred roughly 320 m west of the anchor. `buildMeshes` shifts
the mesh's origin from this anchor onto `SURFACE_FIXED_SITES.soendermarken`
(the crop-bounds centre) rather than recentring on a mass centroid — see
`GeoreferencedMeshSource` in `tools/meshes/@types/`.

DVR90 is the app's own DHM terrain datum, so the scan's heights need no geoid
shift to compare against or cut into the drawn terrain.

## Attribution

CC BY 4.0 obliges credit wherever the model is shown; the photogrammetry
processing (COLMAP + OpenMVS, this repo's own pipeline) is not itself a
separate licensed work. `npm run build-meshes` copies the string below onto
the generated `MESH_ASSETS.soendermarken` row:

> Contains skråfoto © Klimadatastyrelsen (CC BY 4.0); photogrammetry by Alexander Rulkens

See `data/raw/skraafoto/README.md` for the flight's own licence chain
(Klimadatastyrelsen's CC BY 4.0 terms, accepted credit strings) and
`data/raw/dhm/README.md` for the sibling DHM terrain licence.
