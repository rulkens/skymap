# Whale — raw source model

The sperm whale that falls past Earth in the mesh-body layer. A Sketchfab
download: **gitignored**, same posture as the planet textures — only this
README and the checksum sidecar (`../meshes.sha256`) are committed. Registered
as `meshes.whale` in `tools/utils/io/rawDataRegistry.ts`; `MESH_SOURCES.whale`
(`tools/utils/io/meshSources.ts`) points `npm run build-meshes` at it.

| Field      | Value                                                                                 |
| ---------- | ------------------------------------------------------------------------------------- |
| Model      | "Livyatan melvillei"                                                                  |
| Author     | Major — <https://sketchfab.com/majorgalah>                                            |
| Source     | <https://sketchfab.com/3d-models/livyatan-melvillei-8313bd7fde514b108c9ef469817b62ba> |
| Licence    | CC BY 4.0 — legal code at <https://creativecommons.org/licenses/by/4.0/legalcode>     |
| Fetch date | 2026-09-10                                                                            |
| File       | `whale.glb`, 1,435,168 bytes                                                          |
| sha256     | `8dcb2f2f471897e638a07c62eb66b972d64ffa8f49ae8278b3bab6b658cbf6f0`                    |

## How to obtain

Sketchfab requires a logged-in browser session, so there is no fetcher: open the
source URL, download the **glTF** variant, and save its `.glb` here as
`whale.glb`. Verify with `shasum -c meshes.sha256` from `data/raw/meshes/`.

## Attribution — required

CC BY 4.0 obliges credit wherever the model is shown. The runtime carries it in
the Splash footer's credits paragraph; `ATTRIBUTIONS.md` and the README imagery
table carry the long form. `npm run build-meshes` copies the string below onto
the generated `MESH_ASSETS.whale` row, which is the machine-readable original:

> This work is based on "Livyatan melvillei" (https://sketchfab.com/3d-models/livyatan-melvillei-8313bd7fde514b108c9ef469817b62ba) by Major (https://sketchfab.com/majorgalah) licensed under CC-BY-4.0

CC BY 4.0 permits use, adaptation and redistribution, commercial included, so
long as that credit is given. Skymap ships a derivative: `npm run build-meshes`
de-rigs the model, merges its primitives and resizes its textures.

## As inspected (2026-09-10)

Sketchfab glTF 2.0 export: 3 `TRIANGLES` primitives sharing one material
(baseColor + metallicRoughness + normal, 1024² PNG each), 5,598 tris / 3,278
verts, `TANGENT` authored. It is **rigged** — the primitives carry
`JOINTS_0`/`WEIGHTS_0` and the file has a skin, which `buildMeshes` strips to
bake the rest pose. The authored bbox spans 12.9 m on the long axis, inside
Livyatan's real ~13–17 m range, so the model is already at real-world scale and
feeds the bake in native metres with no rescale.
