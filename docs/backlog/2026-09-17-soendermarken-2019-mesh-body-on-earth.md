# Søndermarken 2019 mesh body on Earth

**Status:** part 2 of 2; part 1 shipped
(`docs/superpowers/specs/completed/2026-09-17-workbench-outline-crop-design.md`)
and F3a landed. First slice agreed: `repack-atlas --size 4096|2048` publishing
sibling `-4k`/`-2k` assets — pack the existing charts by shape (xatlas-style)
and rebake, falling back to bbox maxrects packing.

**Measured (2026-09-17 `crop-mesh`).** 470,046 / 660,051 tris kept. One
8192² JPEG (9.3 MB); the source used 13.8 % of it (all UVs in V ≤ 0.362),
the crop 9.4 % ≈ 6.3M px. 12,946 charts (median 21 px, largest 351 px, 352
under 4 px); chart bboxes + 2 px pad need 15.6M px, so bbox packing gets
~0.9× linear at 4K and ~0.5× at 2K, shape packing ~1.0× and ~0.7×.

**Goal.** Put the `soendermarken-crop-2019` `mesh-cropped` asset on Earth as a
mesh body at its real location.

**Open questions (from the 2026-09-17 brainstorm).**

- Budget: shared 150k tris / 2048² (`tools/meshes/buildMeshes.ts`) or a
  per-body override. Either way the pipeline needs decimation (meshoptimizer,
  seams locked so charts survive a re-pack done first) and the atlas re-pack.
- Placement: `surfaceFixedSites` row + `surfaceLocked` rotation; the group
  anchor (55.67, 12.53) looks rounded — verify against the bake origin; height
  is DVR90, the site wants ellipsoidal (geoid ≈ +36–40 m at Copenhagen).
- Axes: OpenMVS GLB is group-frame Z-up; `bodyFromSource` must convert.
- Shading: the atlas carries baked sunlight — mesh-body PBR would light it
  twice; needs an unlit/emissive material path.
- Ground seam: the mesh contains the lawn, so it z-fights the Earth surface
  tiles and F3a terrain; the outline edge is where the seam shows.
