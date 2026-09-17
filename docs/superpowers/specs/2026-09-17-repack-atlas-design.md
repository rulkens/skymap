# repack-atlas — mesh texture atlas re-pack (Søndermarken part 2, slice 1)

**Status:** ratified shape 2026-09-17 (refactor-ground checkpoint signed off; one PR, prep first).
**Parent:** `docs/backlog/2026-09-17-soendermarken-2019-mesh-body-on-earth.md` (part 2).
**Predecessor:** `docs/superpowers/specs/completed/2026-09-17-workbench-outline-crop-design.md`.

## 1. Goal

`npm run repack-atlas -- --group <id> --asset <assetId> --size 4096|2048` re-packs a scene-group
mesh asset's texture atlas into a square atlas of that size and publishes it as a sibling asset
`<assetId>-4k` / `<assetId>-2k`. The existing UV charts are kept (no re-parameterisation); only
their placement changes.

- **4096²: pixel-exact.** Every source texel lands on a destination texel centre and is copied;
  the only loss is the JPEG re-encode. The user approved this look on the spike preview.
- **2048²: resampled.** The largest uniform scale that fits one atlas (≈ 0.44 on
  `soendermarken-crop-2019/mesh-cropped`).

User ruling: the 4K result is what the main app's medium tier will get and 2K the small tier.
Getting either into the main app is a later slice (§8).

## 2. Measured input (spike, 2026-09-17)

`mesh-cropped`: 470,046 tris, one 8192² JPEG (9.3 MB), UVs only in V ≤ 0.362, 9.4 % texel
coverage ≈ 6.3M px, 12,946 charts (median 21 px). Spike results: 4K exact = 4.33 MB JPEG at q90,
470,046 tris, one atlas; 2K at 0.44 = 1.19 MB.

## 3. Data

No type changes. Outputs are ordinary `TexturedMeshAsset`s:

- `id`: `<assetId>-4k` | `<assetId>-2k`; `label`: `<source label> — 4K atlas` | `— 2K atlas`.
- `transform`: the source's; `triangleCount`: the source's (no face is dropped — §5.3).
- `provenance`: the source's, `pipeline` + `{ step: 'repackAtlas', version }` with
  `version = \`${size}@${scale.toFixed(3)} xatlas-wasm@<pkg version> q${JPEG_QUALITY}\``.
  Ruling: parameters ride the version string; a structured record waits for a reader that needs it.

Re-running overwrites the same sibling (same id, same `mesh.glb` path).

## 4. Ground preparation

**Sketch verdicts.** Deriving a sibling mesh asset from a manifest asset is inline in
`tools/scene-recon/cropMesh.ts:53-90` (read manifest → find `kind: 'mesh'` source → read
`mesh.glb` → `packMeshGlb` → copy transform/provenance + append step → `publishAsset`).
`repack-atlas` would be its second copy — bolt-on. Everything else is growth (new files; JPEG
encode and raw decode stay single inline `sharp` calls, as everywhere else in `tools/`).

**P1 (own commit, first):** extract, behaviour-preserving, guarded by `cropMesh.test.ts`:

```ts
// tools/scene-recon/derive/readSourceMesh.ts
export async function readSourceMesh(
  group: SceneGroupDefinition,
  assetId: string,
): Promise<{ source: TexturedMeshAsset; geometry: TexturedMeshGeometry }>;

// tools/scene-recon/derive/publishDerivedMesh.ts
export async function publishDerivedMesh(
  group: SceneGroupDefinition,
  source: TexturedMeshAsset,
  derived: {
    idSuffix: string;
    labelSuffix: string;
    step: PipelineStep;
    geometry: TexturedMeshGeometry;
  },
): Promise<TexturedMeshAsset>;
```

`cropMesh.ts` keeps only the outline read, the crop, and its report.

**Greenfield cross-check.** Agreed on sibling assets, `--size` over tier names, pure core + IO
shell. Diverged on provenance (structured record vs `{step, version}`): priced at the checkpoint,
user kept `{step, version}`.

## 5. Algorithm

### 5.1 Pack (`atlas/packCharts.ts`)

`xatlas-wasm` (devDependency): `addUvMesh` with UVs in **source texel units** (× source atlas
size) and the source indices; `computeCharts`; `packCharts({ resolution: size, texelsPerUnit:
scale, padding: 2, bilinear: true, rotateChartsToAxis: false, rotateCharts: true })`; `getMesh`
→ per output vertex `xref`, `uv` (dest texels), `atlasIndex`, `chartIndex`.

Landmines the spike hit (each is a test or an assertion):

- 0–1 UVs make xatlas drop faces under its area epsilon — always texel units.
- `texelsPerUnit` left 0 makes xatlas choose its own scale (a 7000² atlas for `resolution` 4096).
- Overflow into a second atlas is silent — `atlasCount !== 1` is a failed attempt.
- Default `rotateChartsToAxis` rotates charts by arbitrary angles — the blur the user saw.

### 5.2 Scale (`atlas/fitAtlasScale.ts`)

Try `scale = 1` first; if one atlas holds it, the bake is exact (§5.4). Otherwise start from
`min(1, sqrt(size² · 0.6 / usedTexels))` (`usedTexels` = `uvCoverage` × source texels; 0.6 is the
spike's fill ratio at 2K) and step down by 2 % until `atlasCount === 1`; that bake resamples.
Exact vs resampled is therefore derived from the fit, never a flag. On `mesh-cropped`, 4096 fits
at 1.0 and 2048 at ≈ 0.44.

### 5.3 Placement (`atlas/chartPlacements.ts`)

xatlas only chooses where each chart goes. Per chart, fit the old→new UV map from its vertices
and snap it to `ChartPlacement = { turns: 0 | 1 | 2 | 3; offsetPx: Vec2 }` (scale 1) or
`{ turns; scale; offsetPx }` (scale < 1), anchored at xatlas's bounding-box corner so the chart
stays inside xatlas's (upscaled, padded) footprint. Charts whose fit isn't axis-aligned take the
turn that matches their bbox dimensions. New UVs are recomputed from the placement, not taken
from xatlas.

**Orphans.** Vertices with `atlasIndex === -1` come from faces whose three UVs coincide (OpenMVS's
"no camera saw this face" fallback, one point (20, 1) on `mesh-cropped`, 3,801 faces). Group them
by old UV point; each point gets a 6×6 block in free atlas space (checked against the coverage
mask with a 2-texel border), filled with the source colour at that point; its vertices map to the
block centre. No face is ever dropped.

### 5.4 Bake

- `atlas/blitChartsExact.ts` (scale 1): rasterize each triangle in destination space
  (texel centres inside or within 0.71 px — half a diagonal — of an edge), map through the
  placement to the source texel, copy nearest. Assert every mapped position is a source texel
  centre.
- `atlas/resampleCharts.ts` (scale < 1): same raster, bilinear sample from the source pre-shrunk
  once with sharp `lanczos3` by `scale`.
- `atlas/paintOrphanBlocks.ts`, then `atlas/dilateAtlas.ts`: 16 passes of empty texels taking the
  mean of filled 8-neighbours, remaining empties set to the atlas mean colour (no black texels —
  they bleed at low mips).

### 5.5 Encode and publish

sharp `jpeg({ quality: 90, mozjpeg: true })`; `publishDerivedMesh` with suffix `4k` / `2k`.

### 5.6 Assertions (throw, never warn)

atlasCount 1 · triangle count unchanged · every triangle's centroid texel written · no two charts
claim a texel · exact mode: every copy sampled a source texel centre.

## 6. Report

One stderr line:
`repackAtlas: mesh-cropped → mesh-cropped-4k 4096² scale 1.000 | 12,945 charts, 4,461 orphan verts (1 block) | 470,046 tris | 4.33 MB (source 9.30 MB)`

## 7. Testing

- `fitAtlasScale`, `chartPlacements` (a synthetic two-chart mesh with a known 90° turn and
  fractional xatlas offset → integer placement), `paintOrphanBlocks`, `dilateAtlas` (no empty texel
  left): pure-function unit tests.
- `repackAtlas` integration test on a small synthetic textured mesh (a few charts, one point-UV
  face) at a tiny atlas size: exact mode reproduces source texels bit-for-bit before encoding;
  triangle count unchanged; orphan face samples its block.
- P1 guarded by the existing `cropMesh.test.ts`.
- User eye-check in the workbench: `mesh-cropped-4k` vs `mesh-cropped`, and `-2k`.

## 8. Out of scope

- **Main-app tiers for mesh bodies.** Mesh bodies have none today: `tools/meshes/buildMeshes.ts:40-41`
  fixes 150k tris / 2048², and `meshFetcher.ts:51` loads one path. Only planet textures are tiered
  (`src/utils/math/tierToTexturePx.ts`: small 2048, medium 4096, large 8192 — matching the user's
  4K→medium, 2K→small ruling). Recorded in the part 2 backlog detail.
- Decimation, datum, placement on Earth, unlit shading, ground seam (part 2 backlog).
- Deleting the throwaway spike previews (`mesh-cropped-4k`, `-2k`, `-4k-exact` in main's
  `public/data`) happens after this tool's first real publish overwrites/replaces them.
