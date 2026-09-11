# Voyager probe — raw source model

The Voyager spacecraft in the mesh-body layer. A NASA 3D Resources download:
**gitignored**, same posture as the planet textures — only this README and the
checksum sidecar (`../meshes.sha256`) are committed. Registered as
`meshes.voyagerSource` in `tools/utils/io/rawDataRegistry.ts`; the pre-baked
`meshes.voyager` beside it is what `npm run build-meshes` reads.

| Field      | Value                                                              |
| ---------- | ------------------------------------------------------------------ |
| Model      | "Voyager Probe (B)"                                                |
| Author     | NASA / Michael D. Carbajal (NASA Headquarters)                     |
| Source     | <https://science.nasa.gov/3d-resources/voyager-probe-b/>           |
| Licence    | Public domain — NASA 3D Resources are "free and without copyright" |
| Fetch date | 2026-09-11                                                         |
| File       | `Voyager Probe (B).glb`, 1,720,864 bytes                           |
| sha256     | `bd86ded828dd3f459293aee4ffc3cd0998d8db67439317c8299650a1174c3289` |

## How to obtain

```
curl -L -o "data/raw/meshes/voyager/Voyager Probe (B).glb" \
  "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/voyager-probe-(b)/Voyager%20Probe%20(B).glb"
```

Verify with `shasum -c meshes.sha256` from `data/raw/meshes/`.

## The pre-bake — what `build-meshes` actually reads

`MESH_SOURCES.voyager` points at `voyager.prebaked.glb`, **not** the download:
the source carries three materials and `buildMeshes` refuses multi-material
input by design, so the flattening happens upstream, once:

```
npm run prebake-mesh -- voyager    # Blender 5.2 LTS; ~10 s, not run in CI
```

`tools/meshes/prebake/meshPrebake.py` drops the `_root` placeholder cube, joins
the three parts, smart-UV-projects and bakes all three materials into one 2048²
albedo atlas. Its output and the loose `voyager.prebaked.albedo.png` beside it
are gitignored build products — regenerate them, don't archive them. Having no
normal or metallicRoughness map is expected: `buildMeshes` substitutes 1×1
constants and records `normalMapSubstituted: true`.

## Attribution

NASA content is not copyrighted and needs no permission for informational use,
but NASA asks that its material not imply endorsement, and its insignia are
protected separately — see <https://www.nasa.gov/nasa-brand-center/images-and-media>.
`npm run build-meshes` copies the string below onto the generated
`MESH_ASSETS.voyager` row:

> Voyager Probe (B) by NASA / Michael D. Carbajal — NASA 3D Resources, public domain (https://science.nasa.gov/3d-resources/voyager-probe-b/)

## As inspected (2026-09-11)

glTF 2.0, Draco-compressed, 4 mesh nodes: three textured parts (20,378 tris,
one material each, 1024² baseColor PNG, no normal/MR maps) plus a 1 m `_root`
placeholder cube the exporter left on the scene graph. No rig, no animation.

**Units: metres, +Z up (Blender frame).** The high-gain antenna reflector
measures 3.81 m across the rim against the real 3.66 m dish — inside 5 %, so
the model feeds the bake in native metres with no rescale. Bounding box spans
7.75 × 16.91 × 11.04 m; the size is almost all magnetometer boom, which runs
from the bus toward −Y and +Z to a tip 15.6 m from the origin. The bus and dish
cluster is only ~4 m across.

Axes **in the pre-baked GLB** (glTF Y-up, which is also the download's frame):

| Feature                            | Direction            |
| ---------------------------------- | -------------------- |
| High-gain antenna (dish) axis      | +Y                   |
| Science boom / instrument scan     | −Z                   |
| Magnetometer boom                  | +Z, tilted toward +Y |
| Planetary-radio-astronomy antennas | ±X                   |

## Orbital elements — refresh query

The `voyager1`/`voyager2` rows in `src/data/bodies/orbitalElements.ts` transcribe
JPL Horizons osculating elements (heliocentric, ecliptic J2000, AU-D) at JDTDB
2461294.5. To refresh, fetch and transcribe `EC A IN OM W Tp N` (swap `-31` for
`-32` for Voyager 2), then update the epoch comment beside the rows:

```
https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='-31'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='ELEMENTS'&CENTER='500@10'&START_TIME='2026-09-11'&STOP_TIME='2026-09-12'&STEP_SIZE='1d'&REF_PLANE='ECLIPTIC'&OUT_UNITS='AU-D'
```
