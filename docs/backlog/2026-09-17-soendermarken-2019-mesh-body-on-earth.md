# Søndermarken 2019 mesh body on Earth

**Status:** part 2 of 2; part 1 shipped
(`docs/superpowers/specs/completed/2026-09-17-workbench-outline-crop-design.md`)
and F3a landed. Slice 1 shipped: `repack-atlas`
(`docs/superpowers/specs/completed/2026-09-17-repack-atlas-design.md`) — 4K exact
(4.18 MB), 2K resampled at 0.422 (1.29 MB), both published as siblings of
`mesh-cropped`; user ruling: 4K → main-app medium tier, 2K → small tier.

**Measured (2026-09-17 `crop-mesh`).** 470,046 / 660,051 tris kept. One
8192² JPEG (9.3 MB); the source used 13.8 % of it (all UVs in V ≤ 0.362),
the crop 9.4 % ≈ 6.3M px. Spike: xatlas 4K exact 4.33 MB, 2K at 0.44× 1.19 MB.

**Goal.** Put the `soendermarken-crop-2019` `mesh-cropped` asset on Earth as a
mesh body at its real location.

**Open questions (from the 2026-09-17 brainstorm).**

- Budget: shared 150k tris / 2048² (`tools/meshes/buildMeshes.ts`) or a
  per-body override. Either way the pipeline needs decimation (meshoptimizer,
  seams locked so charts survive a re-pack done first).
- Tiers: mesh bodies have none — `buildMeshes.ts:40-41` fixes the budget and
  `meshFetcher.ts:51` loads one path; only planet textures tier
  (`tierToTexturePx`: small 2048, medium 4096). Shipping 2K/4K per tier needs a
  per-tier mesh texture path.
- Placement: `surfaceFixedSites` row + `surfaceLocked` rotation; the group
  anchor (55.67, 12.53) looks rounded — verify against the bake origin; height
  is DVR90, the site wants ellipsoidal (geoid ≈ +36–40 m at Copenhagen).
- Axes: OpenMVS GLB is group-frame Z-up; `bodyFromSource` must convert.
- Shading: the atlas carries baked sunlight — mesh-body PBR would light it
  twice; needs an unlit/emissive material path.
- Ground seam: the mesh contains the lawn, so it z-fights the Earth surface
  tiles and F3a terrain; the outline edge is where the seam shows.
