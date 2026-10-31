# Bennu — shape model and albedo mosaic

Bennu drawn as a mesh: the asteroid stays a celestial body (`SCENE_PLANETS`);
only its presentation is the shape model. The downloads are **gitignored**; this
README and the checksum lines in `../meshes.sha256` are committed. Registered as
`meshes.bennuSource`, `meshes.bennuAlbedo`, `meshes.bennuBlend` and
`meshes.bennu` (the pre-baked GLB `npm run build-meshes` reads).

| Field      | Shape                                                                 | Colour                                                                            |
| ---------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Product    | OSIRIS-REx AltWG shape model v020 from OLA, 3,145,728 plates (88 cm)  | ShapeV20 normal-albedo global mosaic, 69.8 ppd (25134×12568), ±55° latitude only |
| Author     | OSIRIS-REx Altimetry Working Group (O. Barnouin, JHU/APL), 2020-04-14 | Golish et al. 2021; NASA/University of Arizona                                    |
| Source     | NAIF, OSIRIS-REx PDS4 SPICE archive                                   | USGS planetary maps                                                               |
| Licence    | NASA PDS archive, no licence stated                                   | Public domain (USGS use constraints)                                              |
| Fetch date | 2026-10-30                                                            | 2026-10-30                                                                        |
| File       | `bennu_g_00880mm_alt_obj_0000n00000_v020.bds`, 112,964,608 bytes      | `Bennu_global_ShapeV20_GndControl_ROLOphase_ALBEDO_8bit_v6.tif`, 315,960,161 bytes |

## How to obtain

```
curl -o data/raw/meshes/bennu/bennu_g_00880mm_alt_obj_0000n00000_v020.bds \
  https://naif.jpl.nasa.gov/pub/naif/pds/pds4/orex/orex_spice/spice_kernels/dsk/bennu_g_00880mm_alt_obj_0000n00000_v020.bds
curl -L -o data/raw/meshes/bennu/Bennu_global_ShapeV20_GndControl_ROLOphase_ALBEDO_8bit_v6.tif \
  https://planetarymaps.usgs.gov/mosaic/Bennu/Bennu_global_ShapeV20_GndControl_ROLOphase_ALBEDO_8bit_v6.tif
```

Verify with `shasum -a 256 -c meshes.sha256` from `data/raw/meshes/`.

## One-off preparation

The shape is converted from its type-2 plate DSK to an OBJ once, with
`spiceypy` in a scratch venv (SPICE's
`dskexp -dsk <in>.bds -text <out>.obj -format 3` does the same). No converter
is kept in the repo:

```python
import numpy as np, spiceypy as sp
sp.found_check_off()  # dlafns returns found=False at the end instead of raising
h = sp.dasopr("bennu_g_00880mm_alt_obj_0000n00000_v020.bds"); dla, found = sp.dlabfs(h); v, p = [], []
while found:
    nv, nplates = sp.dskz02(h, dla)
    p.append(np.array(sp.dskp02(h, dla, 1, nplates)) + sum(map(len, v)))  # 1-based already
    v.append(np.array(sp.dskv02(h, dla, 1, nv))); dla, found = sp.dlafns(h, dla)
with open("bennu_g_00880mm_alt_obj_0000n00000_v020.obj", "w") as f:
    np.savetxt(f, np.concatenate(v), fmt="v %.6f %.6f %.6f"); np.savetxt(f, np.concatenate(p), fmt="f %d %d %d")
```

That gives 1,579,014 vertices and 3,145,728 plates, radius 0.213678–0.291466 km.

The mosaic is too large for the import, so it is shrunk once to
`Bennu_global_ShapeV20_GndControl_ROLOphase_ALBEDO_8bit_v6.8192.png` with numpy
and Pillow: pixels of value 0 (NoData, which includes both polar caps beyond
±55°) are set to the median of the valid pixels (131; 40.98% of the map
filled), so the caps read as average rock, then the map is box-downsampled to
8192×4096.

## Frame and units

The shape is in **km**, in the IAU_BENNU frame (v12 onwards fixes W₀ so a
chosen surface feature sits at 0°): +X the prime meridian, +Z the north pole,
origin at the centre of mass. The ShapeV20 mosaic was built on the same shape,
so the two agree at 0°. `MESH_SOURCES.bennu` keeps the source origin
(`origin: 'source'`) and only undoes the glTF export's Y-up turn. The radius
extremes about the 242 m datum set the row's `reliefM`.

The mosaic is planetocentric, east-positive, left edge **0°**; the import's
180° offset only absorbs that left edge. Its 8-bit values are a stretch of the
true normal albedo, which the import rescales to the seed albedo anyway.

## Rebuild

1. `npm run import-mesh -- bennu` — imports the OBJ with identity axes, scales
   to metres, smooth-shades, and paints a rock material that samples the
   mosaic by longitude/latitude (median rescaled to the seed albedo,
   99.7th-percentile cap).
2. `npm run prebake-mesh -- bennu` — keeps the full surface as the bake source,
   decimates a copy to 150k triangles, and bakes 4096² albedo, normal,
   roughness and metallic atlases selected-to-active onto it. 150k, as for
   Phobos: the normal atlas carries the boulders the triangles lose, at a
   quarter of the 600k budget's download.
3. `npm run build-meshes` — `small` and `medium` share the 150k mesh and differ
   only in atlas size (2048 / 4096).
