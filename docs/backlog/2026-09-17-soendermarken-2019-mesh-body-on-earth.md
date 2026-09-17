# Søndermarken 2019 mesh body on Earth

**Status:** part 2 of 2; gated on part 1 (scene-workbench mesh outline crop,
`docs/superpowers/specs/2026-09-17-workbench-outline-crop-design.md`) measuring
the cropped triangle count, and on terrain F3a landing.

**Goal.** Put the `soendermarken-crop-2019` `mesh-cropped` asset on Earth as a
mesh body at its real location.

**Open questions (from the 2026-09-17 brainstorm).**

- Budget: shared 150k tris / 2048² (`tools/meshes/buildMeshes.ts`) or a
  per-body override; decide from part 1's `crop-mesh` numbers. Either way the
  pipeline needs decimation (meshoptimizer) and an atlas re-pack of the kept
  UVs.
- Placement: `surfaceFixedSites` row + `surfaceLocked` rotation; the group
  anchor (55.67, 12.53) looks rounded — verify against the bake origin; height
  is DVR90, the site wants ellipsoidal (geoid ≈ +36–40 m at Copenhagen).
- Axes: OpenMVS GLB is group-frame Z-up; `bodyFromSource` must convert.
- Shading: the atlas carries baked sunlight — mesh-body PBR would light it
  twice; needs an unlit/emissive material path.
- Ground seam: the mesh contains the lawn, so it z-fights the Earth surface
  tiles and F3a terrain; the outline edge is where the seam shows.
