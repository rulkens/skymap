# Phobos — shape model and colour mosaic

Phobos drawn as a mesh: the moon stays a celestial body (`SCENE_PLANETS`); only
its presentation is the shape model. The downloads are **gitignored**; this
README and the checksum lines in `../meshes.sha256` are committed. Registered as
`meshes.phobosSource`, `meshes.phobosAlbedo`, `meshes.phobosBlend` and
`meshes.phobos` (the pre-baked GLB `npm run build-meshes` reads).

| Field      | Shape                                                                 | Colour                                                                 |
| ---------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Product    | Gaskell Phobos shape model M003, 3,145,728 facets                     | Viking Orbiter global mosaic, 40 ppd, DLR control                      |
| Author     | R. Gaskell (Planetary Science Institute)                              | USGS Astrogeology / DLR                                                |
| Source     | NAIF, beside the Rosetta DSKs                                         | USGS planetary maps                                                    |
| Licence    | NASA PDS archive, no licence stated                                   | Public domain (USGS)                                                   |
| Fetch date | 2026-10-19                                                            | 2026-10-16                                                             |
| File       | `PHOBOS_M003_GAS_V01.OBJ`, 207,999,348 bytes                          | `Phobos_Viking_Mosaic_40ppd_DLRcontrol.tif`, 103,738,243 bytes         |

## How to obtain

```
curl -o data/raw/meshes/phobos/PHOBOS_M003_GAS_V01.OBJ \
  https://naif.jpl.nasa.gov/pub/naif/ROSETTA/kernels/dsk/PHOBOS_M003_GAS_V01.OBJ
curl -L -o data/raw/meshes/phobos/Phobos_Viking_Mosaic_40ppd_DLRcontrol.tif \
  https://planetarymaps.usgs.gov/mosaic/Phobos_Viking_Mosaic_40ppd_DLRcontrol.tif
```

Verify with `shasum -a 256 -c meshes.sha256` from `data/raw/meshes/`.

## Frame and units

The shape is in **km**, in the IAU Phobos body frame: +X the sub-Mars
(longitude 0) direction, +Z the spin pole, origin at the centre of mass. That is
the frame `rotationTidallyLocked` aims, so `MESH_SOURCES.phobos` keeps the source
origin (`origin: 'source'`) and only undoes the glTF export's Y-up turn.
Measured radius 8.10–13.94 km about the 11 km datum, which sets the row's `reliefM`.

The mosaic is planetocentric, east-positive, left edge −180°. Cross-correlating
its high-passed brightness against the baked relief puts the best match at
**+4.5°** (sampled 4.5° east of each surface point), confirmed by eye on Stickney
and its neighbours.

## Rebuild

1. `npm run import-mesh -- phobos` — imports the OBJ with identity axes, scales to
   metres, smooth-shades, and paints a rock material that samples the mosaic by
   longitude/latitude (median rescaled to the seed albedo, 99.7th-percentile cap).
2. `npm run prebake-mesh -- phobos` — keeps the full surface as the bake source,
   decimates a copy to 150k triangles, and bakes 4096² albedo, normal, roughness
   and metallic atlases selected-to-active onto it. Not the 600k budget: at 150k
   the normal atlas carries 0.3° median (p99 2.9°) of relief the triangles lost,
   about half of which a 600k copy would hold in geometry instead, at four times
   the download.
3. `npm run build-meshes` — `small` and `medium` share the 150k mesh and differ
   only in atlas size (2048 / 4096).
