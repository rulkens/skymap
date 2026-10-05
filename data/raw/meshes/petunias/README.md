# Bowl of petunias — raw source model

The hanging basket that falls alongside the whale. A Sketchfab download:
**gitignored**, same posture as the planet textures — only this README and the
checksum sidecar (`../meshes.sha256`) are committed. Registered as
`meshes.petuniasSource` in `tools/utils/io/rawDataRegistry.ts`; the pre-baked
`meshes.petunias` beside it is what `npm run build-meshes` reads.

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

## The `.blend` — the edited source

`petunias.blend` is what the pre-bake opens, not the download above. Written by
Blender 5.2 LTS, it does not open in older versions. Re-import it from the
pristine download at any time with `npm run import-mesh -- petunias` — this
**overwrites any edits** made since the last import.

The source is a SketchUp export: 781 primitives, 11 materials, 79 `LINES` edge
primitives (dropped — face-less, no surface), and every face its own island of
loose vertices. `tools/meshes/prebake/importMesh.py` drops the duplicate white
pot shell (an untextured twin of `MarianneStonePot2` on material `"material"`),
unifies each part's UV layer to one shared name, and welds vertices within
0.2 mm — without the weld, `smart_project` yields ~150k one-triangle islands
and COLLAPSE decimation has no edges to collapse along.

## The pre-bake — what `build-meshes` actually reads

`MESH_SOURCES.petunias` points at `petunias.prebaked.glb`, **not** `petunias.blend`:
the source carries 11 materials and `buildMeshes` refuses multi-material input
by design, so the flattening happens upstream, once:

```
npm run prebake-mesh -- petunias    # Blender 5.2 LTS; not run in CI
```

`tools/meshes/prebake/meshPrebake.py` joins the parts (leaving behind any
face-less/materialless leftovers), decimates to `MESH_TRIANGLE_BUDGET` when over it,
smart-UV-projects and bakes the material stack into the five `BAKE_PASSES`
atlases — albedo, normal, roughness, metallic and
occlusion. Its output and the loose `petunias.prebaked.*.png` atlases beside it
are both gitignored build products — regenerate them, don't archive them.

## Attribution — required

CC BY 4.0 obliges credit wherever the model is shown, pre-bake included — the
atlases are a derivative of the author's textures. The runtime carries it in the
Splash footer's credits paragraph; `ATTRIBUTIONS.md` and the README imagery
table carry the long form. `npm run build-meshes` copies the string below onto
the generated `MESH_ASSETS.petunias` row, which is the machine-readable
original:

> This work is based on "Flowers Petunia White" (https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0) by Marianne Goudriaan (https://sketchfab.com/mariannegoudriaan) licensed under CC-BY-4.0

CC BY 4.0 permits use, adaptation and redistribution, commercial included, so
long as that credit is given. Skymap ships a derivative twice over: the pre-bake
decimates the mesh and bakes the author's textures into the runtime atlases, and
`npm run build-meshes` bakes those to the runtime `.mesh` + PNG set.
