# Vesta — shape model and HAMO mosaic

Vesta drawn as a mesh: the asteroid stays a celestial body (`SCENE_PLANETS`);
only its presentation is the shape model. The downloads are **gitignored**; this
README and the checksum lines in `../meshes.sha256` are committed. Registered as
`meshes.vestaSource`, `meshes.vestaAlbedo`, `meshes.vestaBlend` and
`meshes.vesta` (the pre-baked GLB `npm run build-meshes` reads).

| Field      | Shape                                                              | Colour                                                                   |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Product    | Dawn gravity-team shape model icq0512, 3,145,728 plates (SPC, 50 m) | Dawn FC HAMO clear-filter global mosaic, 74 ppd (26704×13352)            |
| Author     | Dawn Gravity Team, R. Park (JPL), delivered 2022-12-07              | Roatsch et al. (DLR); NASA/JPL-Caltech/UCLA/MPS/DLR/IDA                  |
| Source     | NAIF, Dawn DSKs                                                     | USGS planetary maps                                                      |
| Licence    | NASA PDS archive, no licence stated                                 | No licence named; Astropedia asks to cite the authors                    |
| Fetch date | 2026-10-30                                                          | 2026-10-30                                                               |
| File       | `dawn_vesta_grv_icq0512_v1.bds`, 112,483,328 bytes                  | `Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.tif`, 356,659,263 bytes          |

## How to obtain

```
curl -o data/raw/meshes/vesta/dawn_vesta_grv_icq0512_v1.bds \
  https://naif.jpl.nasa.gov/pub/naif/DAWN/kernels/dsk/dawn_vesta_grv_icq0512_v1.bds
curl -L -o data/raw/meshes/vesta/Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.tif \
  https://planetarymaps.usgs.gov/mosaic/Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.tif
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
h = sp.dasopr("dawn_vesta_grv_icq0512_v1.bds"); dla, found = sp.dlabfs(h); v, p = [], []
while found:
    nv, nplates = sp.dskz02(h, dla)
    p.append(np.array(sp.dskp02(h, dla, 1, nplates)) + sum(map(len, v)))  # 1-based already
    v.append(np.array(sp.dskv02(h, dla, 1, nv))); dla, found = sp.dlafns(h, dla)
with open("dawn_vesta_grv_icq0512_v1.obj", "w") as f:
    np.savetxt(f, np.concatenate(v), fmt="v %.6f %.6f %.6f"); np.savetxt(f, np.concatenate(p), fmt="f %d %d %d")
```

That gives 1,579,014 vertices and 3,145,728 plates, radius 212.358798–292.377357 km.

The mosaic is too large for the import (~5.7 GB as a float RGBA buffer), so it
is shrunk once to `Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.8192.png` with numpy
and Pillow: pixels of value 0 (NoData), and pixels below 20 north of 50° N (the
north was in polar night during HAMO: imaged, but unlit), are set to the median
of the remaining pixels (83; 11.11% of the map filled), then the map is
box-downsampled to 8192×4096.

## Frame and units

The shape is in **km**, in the IAU_VESTA frame of the gravity team's
grv221108 kernel: +X the prime meridian, +Z the north pole, origin at the
centre of mass. Its prime meridian is **Claudia″** (IAU 2015, Claudia crater at
146° E), the same system USGS shifted the HAMO mosaic into, so the two agree at
**0°** offset. Raw Dawn-Claudia products (Claudia at 356° E) would need +150°;
none is used. `MESH_SOURCES.vesta` keeps the source origin (`origin: 'source'`)
and only undoes the glTF export's Y-up turn. The radius extremes about the
261.4 km datum set the row's `reliefM`.

The mosaic is planetocentric, east-positive, left edge −180°.

## Rebuild

1. `npm run import-mesh -- vesta` — imports the OBJ with identity axes, scales
   to metres, smooth-shades, and paints a rock material that samples the
   mosaic by longitude/latitude (median rescaled to the seed albedo,
   99.7th-percentile cap).
2. `npm run prebake-mesh -- vesta` — keeps the full surface as the bake source,
   decimates a copy to 150k triangles, and bakes 4096² albedo, normal,
   roughness and metallic atlases selected-to-active onto it. 150k, as for
   Phobos: the normal atlas carries the relief the triangles lose, at a quarter
   of the 600k budget's download.
3. `npm run build-meshes` — `small` and `medium` share the 150k mesh and differ
   only in atlas size (2048 / 4096).
