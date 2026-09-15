# Hubble Space Telescope — raw source model

The Hubble mesh body, in Earth orbit. A NASA 3D Resources download:
**gitignored**, same posture as the planet textures — only this README and the
checksum sidecar (`../meshes.sha256`) are committed. Registered as
`meshes.hubbleSource` in `tools/utils/io/rawDataRegistry.ts`; the pre-baked
`meshes.hubble` beside it is what `npm run build-meshes` reads.

| Field      | Value                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| Model      | "Hubble Space Telescope (A)"                                                                         |
| Author     | NASA (the mirror names no individual modeller)                                                       |
| Source     | <https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Hubble%20Space%20Telescope%20(A)> |
| Licence    | Public domain — NASA 3D Resources are "free and without copyright"                                   |
| Fetch date | 2026-09-15                                                                                           |
| File       | `Hubble Space Telescope (A).glb`, 1,694,988 bytes                                                    |
| sha256     | `e5ba4de15c7d359ac8fa1ab7e286aff42dec09c0fadae3db99252587f39fa384`                                   |

The model on NASA's own page
(<https://science.nasa.gov/3d-resources/hubble-space-telescope/>) is the
3D-printable one — no materials at all, so it bakes flat grey. Only the GitHub
mirror carries this textured "(A)" variant, hence the raw-URL fetch below.

## How to obtain

```
curl -L -o "data/raw/meshes/hubble/Hubble Space Telescope (A).glb" \
  "https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Hubble%20Space%20Telescope%20(A)/Hubble%20Space%20Telescope%20(A).glb"
```

Verify with `shasum -c meshes.sha256` from `data/raw/meshes/`.

## The `.blend` — the edited source

`hubble.blend` is what the pre-bake opens, not the download above. Written by
Blender 5.2 LTS, it does not open in older versions. Regenerate it from the
pristine download at any time with `npm run import-mesh -- hubble`: every edit
below is the importer's own, so a re-import loses nothing.

`tools/meshes/prebake/importMesh.py` scales the root object by `0.0254` (the
model is authored in INCHES — see below), overrides three materials (next
paragraph) and collapses the UV layers onto one shared name before saving.

**The materials are overridden.** The model types every surface matte
(metallic 0, roughness 0.84–0.91), so baked as authored the telescope reads as
grey cardboard. Hubble is wrapped in aluminised multi-layer insulation, a
crinkled mirror, so the importer row's `materials=` sets `hbltel_1` (the
forward shell, light shield and aft shroud panels), `hbltel_2` (aperture door,
aft bulkhead) and `hbltel_4` (handrails, antenna mast) to metallic 1 at
roughness 0.2–0.3, with a ×2 Base Color gain on `hbltel_1` because its mid-grey
texture becomes a metal's reflectance once metallic. The source has no normal
maps, so the same two materials take `bump=0.08`: the colour texture's
luminance stands in for height at 8 cm per unit, which is what it takes for
its low-contrast crinkle and panel seams to tilt the baked normal a visible
few degrees. `hbltel_3` (the copper Kapton array blankets) and `hbltel_wfc_1`
(the instrument box) bake as authored.

## The pre-bake — what `build-meshes` actually reads

`MESH_SOURCES.hubble` points at `hubble.prebaked.glb`, **not** `hubble.blend`:
the source carries five materials and `buildMeshes` refuses multi-material
input by design, so the flattening happens upstream, once:

```
npm run prebake-mesh -- hubble    # Blender 5.2 LTS; ~5 s, not run in CI
```

`tools/meshes/prebake/meshPrebake.py` joins the parts, smart-UV-projects and
bakes all five materials into one 2048² atlas per `BAKE_PASSES` row — albedo,
normal, roughness and metallic. Its output and the four loose
`hubble.prebaked.*.png` atlases beside it are gitignored build products —
regenerate them, don't archive them.

## Attribution

NASA content is not copyrighted and needs no permission for informational use,
but NASA asks that its material not imply endorsement, and its insignia are
protected separately — see <https://www.nasa.gov/nasa-brand-center/images-and-media>.
`npm run build-meshes` copies the string below onto the generated
`MESH_ASSETS.hubble` row:

> NASA, "Hubble Space Telescope (A)" — NASA 3D Resources (https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Hubble%20Space%20Telescope%20(A))

## As inspected (2026-09-15)

glTF 2.0, one mesh, 23,016 vertices / 7,672 triangles, five materials each with
a baseColor webp texture, no normal or metallicRoughness maps, no rig and no
animation.

**Units: inches.** The bounding box spans 458 (X) × 525 (Y) × 501 (Z) in glTF
axes, and the Y axis is the telescope tube — 13.3 m against the 13.2 m fact sheet once
multiplied by 0.0254, so the importer row carries `scale=0.0254` and nothing is
rescaled by hand. The solar arrays are the original 12 m SA1/SA2 type, not the
shorter rigid-frame pair flown since 2002.

Axes **in the pre-baked GLB** (glTF Y-up, which is also the download's frame):

| Feature                       | Direction |
| ----------------------------- | --------- |
| Aperture / light-shield end   | +Y        |
| Aft shroud                    | −Y        |
| Solar arrays, span            | ±X        |
| Solar arrays, panel long axis | ±Z        |

## Orbital elements — refresh query

The `hubble` row in `src/data/bodies/orbitalElements.ts` transcribes JPL
Horizons osculating elements (geocentric, `REF_PLANE='FRAME'`, KM-D) at JDTDB
2461298.5, and reads the node rate off the same query's 5-day steps
(`OM` 185.7242679 → 151.4846789 → 117.4543700, i.e. −6.827°/day). To refresh,
fetch and transcribe `EC A IN OM W MA N`, re-read the node rate, and update the
epoch comment beside the row:

```
https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='-48'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='ELEMENTS'&CENTER='500@399'&START_TIME='2026-09-15'&STOP_TIME='2026-09-25'&STEP_SIZE='5d'&REF_PLANE='FRAME'&OUT_UNITS='KM-D'
```

These are osculating elements of an orbit that drags: the node rate carries the
plane, so the **plane stays right for months**, but the **phase is exact only at
the epoch** — a Hubble drawn over the right ground track today is drawn over the
wrong one next year. That is the fidelity on offer, and the fidelity
`tests/data/bodies/orbitalElements.hubble.test.ts` pins, against the `VECTORS`
form of the same query.
