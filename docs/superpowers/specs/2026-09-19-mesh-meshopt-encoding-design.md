# Mesh bodies: meshopt-encoded `.mesh` and one triangle budget — design

Three commits on one PR, in this order: petunias joins the generic prebake
pipeline, the triangle counts collapse to one budget, then the format change.

Shrink the `.mesh` download about 3.4× by quantising and meshopt-encoding it,
unpacked back to today's float32 arrays on load, and replace the four
scattered triangle counts with one budget raised to 600k. The raise is what
the smaller files buy: JWST (A) at its full ~494k triangles comes to ~4 MB on
the wire instead of ~15 MB gzip-only.

## Measured (2026-09-19, all eight current meshes, gzip -6 on top of each)

| encoding                           | total   | vs gzip-only |
| ---------------------------------- | ------- | ------------ |
| raw float32 (v2), gzip on the wire | 17.1 MB | 1×           |
| meshopt lossless, float32 layout   | 14.8 MB | 1.16×        |
| **quantised, 10-bit oct (chosen)** | 5.0 MB  | 3.4×         |
| quantised, 8-bit oct               | 4.4 MB  | 3.9×         |
| quantised, 12-bit oct              | 5.4 MB  | 3.2×         |

Decode of the largest mesh (perseverance, 132k vertices) took 4 ms on an M-series
Mac. The decoder is ~8 KB gzipped.

## Data delta

`.mesh` v3 (magic stays `SKMH`), little-endian, every block 4-byte aligned:

```
header   magic u8×4 · version u32 = 3 · vertexCount u32 · indexCount u32
         boundingRadiusM f32 · posMin f32×3 · posScale f32
         byteLength u32 × 5  (one per stream, in the order below)
streams  positions  u16×4  (w = 0)  q = round((p − posMin) / posScale), one isotropic
                                     scale = largest extent / 65535  (≤ 0.26 mm today)
         normals    i16×4  meshopt octahedral filter, 10 bits
         tangents   i16×4  meshopt octahedral filter, 10 bits, w = handedness carried
         uvs        u16×2  unorm over [0, 1]
         indices    u32    meshopt TRIANGLES codec
         each attribute stream is meshopt ATTRIBUTES-encoded at its own stride
```

The stream order is fixed; there is no per-stream descriptor table, because
nothing would read one. UVs are atlas coordinates in [0, 1]; the writer throws on
any outside that range rather than carrying a UV min/scale.

`MeshAsset`, `DecodedMeshGeometry`, `MESH_VERTEX_SLOTS`, the GPU vertex layout and
the shaders do not change: the decoder returns the same float32 arrays as v2.

One constant: `MESH_TRIANGLE_BUDGET = 600_000`.

## Shape

```
src/data/mesh/meshTriangleBudget.ts   MESH_TRIANGLE_BUDGET — what the renderer affords
src/data/mesh/meshBinaryFormat.ts     MESH_VERSION 3; header offsets; decodeMesh becomes
                                      async: awaits MeshoptDecoder.ready, decodes each
                                      stream, unpacks to float32 (normals/tangents xyz
                                      renormalised, tangent w snapped to ±1)
tools/meshes/writeMeshBinary.ts       reorderMesh (vertex cache + fetch) → quantise →
                                      encode; the exact inverse of decodeMesh
src/services/loading/fetchers/meshFetcher.ts   `await decodeMesh(buf)`
tools/meshes/buildMeshes.ts           TRIANGLE_BUDGET and the build-time simplify block
                                      deleted; throws when a prebaked GLB exceeds
                                      MESH_TRIANGLE_BUDGET
tools/meshes/prebakeMesh.ts           passes `--triangles <MESH_TRIANGLE_BUDGET>` to Blender
tools/meshes/prebake/meshPrebake.py   reads --triangles; per-row `triangles=` deleted
                                      (perseverance re-prebakes at its full ~200k)
package.json                          meshoptimizer → dependencies
.claude/skills/add-mission/SKILL.md   "150k budget" text → the one budget
```

### Commit 1: petunias through the generic pipeline

`petuniasPrebake.py` predates `importMesh.py` → `<key>.blend` → `meshPrebake.py` and is
the last mesh on a bespoke script. Fold it in:

```
tools/meshes/prebake/importMesh.py   "petunias": source("petunias.glb", weld=0.0002, …)
                                     new `weld=` row option: merge-by-distance after the join.
                                     SketchUp exports every face as its own island of loose
                                     vertices; unwelded, smart_project yields ~150k one-triangle
                                     islands and COLLAPSE decimation has no edges to work on
tools/meshes/prebake/meshPrebake.py  source("petunias") row
tools/meshes/prebake/petuniasPrebake.py   deleted
package.json                         prebake-petunias script deleted
tools/utils/io/rawDataRegistry.ts    meshes.petuniasBlend row added; meshes.petunias
                                     fetcher → meshPrebake.py
data/raw/meshes/petunias/README.md   rewritten to the voyager README's shape
```

Petunias gains `_mr`, `_normal` and AO from the generic bake, so it will look different.
Needs a user eye-check and a before/after screenshot.

### Reordering and decoding

Reordering lives in the encoder: it helps both the GPU vertex cache and the codec's
compression, costs the runtime nothing, and is deterministic, so content hashes are stable.

Decoding runs on the main thread with no worker: a few milliseconds, once per mesh
load. Revisit only if a perf trace shows a hitch.

## Versioning and deploy

It's a clean break: `decodeMesh` accepts v3 only and throws the existing "regenerate
via build-meshes" error on v2. Workers Builds deploys the code at merge, so from the
merge until `sync-r2-secure` finishes, production mesh bodies fail to load. The post-merge
steps run back to back from the main checkout: `npm run import-mesh -- petunias`,
`npm run prebake-mesh -- petunias`, `npm run prebake-mesh -- perseverance`,
`npm run build-meshes`, `npm run sync-r2-secure`.

## Tests

- `writeMeshBinary` → `decodeMesh` round trip on a small fixture with tangents:
  counts unchanged; the triangle set is identical as position triples (the codec
  may rotate a triangle's vertices but keeps winding); position error ≤ posScale / 2;
  normal and tangent angular error ≤ 0.3°, unit length after renormalise; tangent w
  sign exact; UV error ≤ 0.5 / 65535.
- The writer throws on a UV outside [0, 1].
- `decodeMesh` rejects bad magic and a v2 header (existing tests, re-pointed).
- `buildMeshes` throws on a GLB over the budget (replaces any decimation test).

## Ground preparation

None needed: the format has exactly one writer (`writeMeshBinary`) and one reader
(`decodeMesh`), with a single fetcher calling it. Every touchpoint is growth. The
greenfield cross-check agreed except on a self-describing stream table (dropped:
nothing reads it) and 12-bit octahedral (10-bit ruled; +9% size for 12).

The petunias fold-in and the triangle-budget consolidation are their own commits,
sequenced before the format change, on the same PR (user's ruling).
