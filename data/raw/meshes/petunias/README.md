# Bowl of petunias — raw source model

The hanging basket that falls alongside the whale. A Sketchfab download:
**gitignored**, same posture as the planet textures — only this README and the
checksum sidecar (`../meshes.sha256`) are committed. Registered as
`meshes.petuniasSource` in `tools/utils/io/rawDataRegistry.ts`.

| Field      | Value                                                                             |
| ---------- | --------------------------------------------------------------------------------- |
| Model      | "Flowers Petunia White"                                                           |
| Author     | Marianne Goudriaan — <https://sketchfab.com/mariannegoudriaan>                    |
| Source     | <https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0>                |
| Licence    | CC BY 4.0 — legal code at <https://creativecommons.org/licenses/by/4.0/legalcode> |
| Fetch date | 2026-09-10                                                                        |
| File       | `petunias.glb`, 19,646,792 bytes                                                  |
| sha256     | `4963f8acc1f648301adfc4338e2c9de09cddf7b093e0d5b0fcdea10106745ca9`                |

## How to obtain

Sketchfab requires a logged-in browser session, so there is no fetcher: open the
source URL, download the **glTF** variant, and save its `.glb` here as
`petunias.glb`. Verify with `shasum -c meshes.sha256` from `data/raw/meshes/`.

## The pre-bake — what `build-meshes` actually reads

`MESH_SOURCES.petunias` points at `petunias.prebaked.glb`, **not** the download.
The source is a SketchUp export: 781 primitives, 11 materials, 79 `LINES` edge
primitives, 399,895 tris, no normal and no metallicRoughness map anywhere.
`buildMeshes` refuses multi-material input by design, so the flattening happens
upstream, once, by hand:

```
npm run prebake-petunias    # Blender 5.2 LTS; ~2 min, not run in CI
```

`tools/meshes/prebake/petuniasPrebake.py` drops the edge geometry, joins the
rest, decimates to 150k tris, smart-UV-projects, bakes all 11 materials into one
2048² albedo atlas, and exports a single-material GLB with only
`POSITION`/`NORMAL`/`TEXCOORD_0`. Its output and the loose
`petunias.prebaked.albedo.png` beside it are both gitignored build products —
regenerate them, don't archive them. Having no normal map is expected here:
`buildMeshes` substitutes a 1×1 flat normal and warns, and the generated row
records it as `normalMapSubstituted: true`.

## Attribution — required

CC BY 4.0 obliges credit wherever the model is shown, pre-bake included — the
atlas is a derivative of the author's textures. The runtime carries it in the
Splash footer's credits paragraph; `ATTRIBUTIONS.md` and the README imagery
table carry the long form. `npm run build-meshes` copies the string below onto
the generated `MESH_ASSETS.petunias` row, which is the machine-readable
original:

> This work is based on "Flowers Petunia White" (https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0) by Marianne Goudriaan (https://sketchfab.com/mariannegoudriaan) licensed under CC-BY-4.0

CC BY 4.0 permits use, adaptation and redistribution, commercial included, so
long as that credit is given. Skymap ships a derivative twice over: the pre-bake
decimates the mesh and bakes the author's six textures into one atlas, and
`npm run build-meshes` bakes that to the runtime `.mesh` + PNG trio.
