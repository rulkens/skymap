# Ceres — shape model and Dawn mosaic

Ceres drawn as a mesh: the dwarf planet stays a celestial body
(`SCENE_PLANETS`); only its presentation is the shape model. It is 7.5%
flattened, which a sphere cannot show. The downloads are **gitignored**; this
README and the checksum lines in `../meshes.sha256` are committed. Registered as
`meshes.ceresSource`, `meshes.ceresAlbedo`, `meshes.ceresBlend` and
`meshes.ceres` (the pre-baked GLB `npm run build-meshes` reads).

| Field      | Shape                                                                | Colour                                                          |
| ---------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| Product    | Dawn gravity-team shape model icq0256 v2, 786,432 plates (SPC, 100 m) | Dawn FC clear-filter controlled global mosaic, 20 ppd (7383×3691) |
| Author     | Dawn Gravity Team (JPL), delivered 2018-03-01                         | Roatsch et al. (DLR); NASA/JPL-Caltech/UCLA/MPS/DLR/IDA         |
| Source     | NAIF, Dawn DSKs                                                       | USGS planetary maps                                             |
| Licence    | NASA PDS archive, no licence stated                                   | No licence named; Astropedia asks to cite the authors           |
| Fetch date | 2026-10-30                                                            | 2026-10-30                                                      |
| File       | `dawn_ceres_grv_icq0256_v2.bds`, 30,365,696 bytes                     | `Ceres_Dawn_FC_DLR_global_20ppd_Oct2015.tif`, 27,280,830 bytes  |

## How to obtain

```
curl -o data/raw/meshes/ceres/dawn_ceres_grv_icq0256_v2.bds \
  https://naif.jpl.nasa.gov/pub/naif/DAWN/kernels/dsk/dawn_ceres_grv_icq0256_v2.bds
curl -L -o data/raw/meshes/ceres/Ceres_Dawn_FC_DLR_global_20ppd_Oct2015.tif \
  https://planetarymaps.usgs.gov/mosaic/Ceres_Dawn_FC_DLR_global_20ppd_Oct2015.tif
```

Verify with `shasum -a 256 -c meshes.sha256` from `data/raw/meshes/`.

## One-off preparation

NAIF ships the shape only as a type-2 plate DSK, so it is converted to an OBJ
once, with `spiceypy` in a scratch venv (SPICE's
`dskexp -dsk <in>.bds -text <out>.obj -format 3` does the same). No converter
is kept in the repo:

```python
import numpy as np, spiceypy as sp
sp.found_check_off()  # dlafns returns found=False at the end instead of raising
h = sp.dasopr("dawn_ceres_grv_icq0256_v2.bds"); dla, found = sp.dlabfs(h); v, p = [], []
while found:
    nv, nplates = sp.dskz02(h, dla)
    p.append(np.array(sp.dskp02(h, dla, 1, nplates)) + sum(map(len, v)))  # 1-based already
    v.append(np.array(sp.dskv02(h, dla, 1, nv))); dla, found = sp.dlafns(h, dla)
with open("dawn_ceres_grv_icq0256_v2.obj", "w") as f:
    np.savetxt(f, np.concatenate(v), fmt="v %.6f %.6f %.6f"); np.savetxt(f, np.concatenate(p), fmt="f %d %d %d")
```

That gives 396,294 vertices and 786,432 plates, radius 442.418010–487.012688 km.
The mosaic is used as downloaded.

## Frame and units

The shape is in **km**, in the IAU_CERES frame: +X the prime meridian (every
Dawn system keeps the crater Kait at 0°), +Z the north pole, origin at the
centre of mass. `MESH_SOURCES.ceres` keeps the source origin
(`origin: 'source'`) and only undoes the glTF export's Y-up turn. The radius
extremes about the 469.7 km datum set the row's `reliefM`.

The mosaic is planetocentric, east-positive, centred on 180°, so its left edge
is **0°** (Astropedia's "−180 to 180" text contradicts its own label). Shape
and map agree at 0°; the import's 180° offset only absorbs that left edge.

## Rebuild

1. `npm run import-mesh -- ceres` — imports the OBJ with identity axes, scales
   to metres, smooth-shades, and paints a rock material that samples the
   mosaic by longitude/latitude (median rescaled to the seed albedo,
   99.7th-percentile cap).
2. `npm run prebake-mesh -- ceres` — keeps the full surface as the bake source,
   decimates a copy to 150k triangles, and bakes 4096² albedo, normal,
   roughness and metallic atlases selected-to-active onto it. Capped at 150k
   like the other shape models rather than the 600k budget: Ceres' relief is
   only ±4% of its radius, so the normal atlas carries what the triangles
   lose, at a quarter of the download.
3. `npm run build-meshes` — `small` and `medium` share the 150k mesh and differ
   only in atlas size (2048 / 4096).
