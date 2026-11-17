# Near-lossless WebP for mesh normal and metal-rough atlases

**Why.** `buildMeshes` ships normal and metal-rough atlases lossless; they dominate a mesh
body's download (Bennu's 4096 normal atlas was 14.9 MB of its 22.2 MB). Measured on that atlas
(2026-11-02, PR #986):

| Encoding | Size | p99 angle error | Max |
| --- | --- | --- | --- |
| Lossless | 14.9 MB | 0° | 0° |
| Near-lossless 60 | 9.0 MB | 1.3° | 2.7° |
| Lossy q90 | 3.5 MB | 13.5° | 80° |

Plain lossy breaks normal maps (4:2:0 chroma subsampling smears X and Y across UV seams);
`sharp`'s `{ nearLossless: true, quality: 60 }` keeps a lossless bitstream after
pre-quantising. Ruled (2026-11-02): its own PR, all meshes.

**Scope.** `LOSSLESS_WEBP` in `tools/meshes/buildMeshes.ts`, then `npm run build-meshes` for
every key (needs main's raw GLBs), `build-data-manifest`, eye checks per mesh, R2 sync.
Related: 53% of Bennu's atlas texels are empty (prebake UV packing).
