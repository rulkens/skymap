# Deimos — shape model

Deimos drawn as a mesh: the moon stays a celestial body (`SCENE_PLANETS`); only
its presentation is the shape model. The download is **gitignored**; this README
and the checksum line in `../meshes.sha256` are committed. Registered as
`meshes.deimosSource`, `meshes.deimosBlend` and `meshes.deimos` (the pre-baked GLB).

| Field      | Value                                                |
| ---------- | ---------------------------------------------------- |
| Product    | Thomas Deimos shape model K005, 5,184 facets         |
| Author     | P. Thomas (Cornell)                                  |
| Source     | NAIF, beside the Rosetta DSKs                        |
| Licence    | NASA PDS archive, no licence stated                  |
| Fetch date | 2026-10-16                                           |
| File       | `DEIMOS_K005_THO_V01.OBJ`, 346,608 bytes             |

```
curl -o data/raw/meshes/deimos/DEIMOS_K005_THO_V01.OBJ \
  https://naif.jpl.nasa.gov/pub/naif/ROSETTA/kernels/dsk/DEIMOS_K005_THO_V01.OBJ
```

Same frame and units as Phobos (km, IAU body frame, origin at the centre of
mass). Measured radius 3.58–8.71 km about the 6 km datum. No colour map: the
USGS Deimos basemap is shaded relief with its lighting baked in, so the import
paints the seed albedo. Rebuild with `npm run import-mesh -- deimos`, then
`npm run prebake-mesh -- deimos`, then `npm run build-meshes`.
