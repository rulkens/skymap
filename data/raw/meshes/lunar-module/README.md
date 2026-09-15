# Apollo Lunar Module — raw source model

The lander standing at Tranquility Base (`apollo11`). A NASA 3D Resources
download: **gitignored**, same posture as the planet textures — only this README
and the checksum sidecar (`../meshes.sha256`) are committed. Registered as
`meshes.lunarModuleSource` in `tools/utils/io/rawDataRegistry.ts`; the pre-baked
`meshes.lunarModule` beside it is what `npm run build-meshes` reads. The
directory and mesh key name the vehicle, not the mission: the same model could
stand at every Apollo site.

| Field      | Value                                                              |
| ---------- | ------------------------------------------------------------------ |
| Model      | "Apollo Lunar Module"                                              |
| Author     | NASA / Michael D. Carbajal                                         |
| Source     | <https://science.nasa.gov/3d-resources/apollo-lunar-module/>       |
| Licence    | Public domain — NASA 3D Resources are "free and without copyright" |
| Fetch date | 2026-09-15                                                         |
| File       | `Apollo Lunar Module.glb`, 716,840 bytes                           |
| sha256     | `379101dfcee399267addf771709107c35e826b0b9e5233272f123e4c8a585c4e` |

## How to obtain

```
curl -L -o "data/raw/meshes/lunar-module/Apollo Lunar Module.glb" \
  "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/apollo-lunar-module/Apollo%20Lunar%20Module.glb"
```

Verify with `shasum -c meshes.sha256` from `data/raw/meshes/`.

## The `.blend` — the edited source

`lunar-module.blend` is what the pre-bake opens, not the download above.
Written by Blender 5.2 LTS, it does not open in older versions. Regenerate it
from the pristine download at any time with
`npm run import-mesh -- lunar-module`: every edit below is the importer's own,
so a re-import loses nothing.

`tools/meshes/prebake/importMesh.py` scales the root object by `1.45` (see
below), overrides six materials (next paragraph) and collapses the 134 parts'
UV layers onto one shared name before saving. The file's animations are of
zero duration, so the row names no `frame`.

**The materials are overridden.** Nine of the twelve are flat colours typed
matte (metallic 0, roughness 0.41), and the colours say what each surface is:
`blinn1SG.002` and `blinn9SG.001` (the two golds) are the descent stage's
Kapton blankets → metallic 1, roughness 0.3; `blinn4SG.002`, `blinn3SG.001` and
`initialShadingGr.001` (light greys) the ascent stage's aluminium skin and the
gear struts → metallic 0.9, roughness 0.45; `blinn2SG.002` (dark grey)
metallic 0.7, roughness 0.5. Black, white, the pale window frame and the three
decal-textured materials bake as authored. There is no crinkle to bump from:
the source carries no foil texture, only decals.

## The pre-bake — what `build-meshes` actually reads

`MESH_SOURCES['lunar-module']` points at `lunar-module.prebaked.glb`, **not**
`lunar-module.blend`: the source carries twelve materials and `buildMeshes`
refuses multi-material input by design, so the flattening happens upstream,
once:

```
npm run prebake-mesh -- lunar-module    # Blender 5.2 LTS; ~6 s, not run in CI
```

`tools/meshes/prebake/meshPrebake.py` joins the 134 parts, smart-UV-projects
and bakes all twelve materials into one 2048² atlas per `BAKE_PASSES` row —
albedo, normal, roughness and metallic. Its output and the four loose
`lunar-module.prebaked.*.png` atlases beside it are gitignored build products —
regenerate them, don't archive them.

## Attribution

NASA content is not copyrighted and needs no permission for informational use,
but NASA asks that its material not imply endorsement, and its insignia are
protected separately — see <https://www.nasa.gov/nasa-brand-center/images-and-media>.
`npm run build-meshes` copies the string below onto the generated
`MESH_ASSETS['lunar-module']` row:

> NASA / Michael D. Carbajal, "Apollo Lunar Module" (https://science.nasa.gov/3d-resources/apollo-lunar-module/)

## As inspected (2026-09-15)

glTF 2.0, Draco-compressed, 64,787 vertices / 97,587 triangles, twelve materials
of which three carry a baseColor webp texture. The file holds animations of ZERO
duration, so there is no pose to choose.
The full vehicle is modelled — descent and ascent stages together, Eagle as it
stood in July 1969, not as it was left.

**Units: a 0.7-scale model, so `scale=1.45`.** The native bounding box is
6.43 × 6.43 across the landing gear and 5.01 tall (footpads at y = 0.10). The
real LM measured 9.4 m across diagonally opposed footpads and 7.04 m to the top
of the docking target: 9.4 / 6.43 = 1.462 from the span, 7.04 / 5.01 = 1.405 from
the height. `scale=1.45` favours the span — the better-defined dimension, since
the height depends on which antenna you stop at — and the model then reads
9.32 m across and 7.27 m tall, both within 4 % of the vehicle.

Axes **in the pre-baked GLB** (glTF Y-up, which is also the download's frame) —
the same frame the rover models use, hence the same `bodyFromSource`:

| Feature                           | Direction |
| --------------------------------- | --------- |
| Up (ascent stage, docking target) | +Y        |
| Forward (hatch, ladder, US flag)  | +Z        |
| Landing-gear footpads             | ±X, ±Z    |

No orbital elements: the site is a `SURFACE_FIXED_SITES` row
(0.67416° N, 23.47314° E, planetocentric east-positive), lifted off the Moon's
mean sphere by the bake's own `groundOffsetM`.
