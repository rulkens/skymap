# JWST as a mesh body

**Blocked on:** a position driver for Sun–Earth L2. The add-mission skill has no
maker for halo or Lissajous orbits, because one Keplerian element set cannot hold one.
The simplest driver pins the body at L2, ~1.5 million km from Earth on the anti-Sun
line, and drops the ~800,000 km halo loop, which is invisible at any zoom where JWST
itself is visible. The same driver would carry Gaia and SOHO later.

**Mesh (chosen 2026-09-19):** NASA-3D-Resources `3D Models/James Webb Space Telescope (A)/`
(public domain, 4.7 MB Draco GLB). It goes in at **full resolution**, ~494k triangles, with
no decimation. That needs the one 600k triangle budget from the meshopt-encoding PR (#761).

As inspected:

- Units are metres already. The bbox is ≈ 27 × 12 × 15 m; confirm the long axis (solar
  array and trim flap past the 21.2 m sunshield?) on the six-view renders.
- There are no textures. The 46 named materials carry flat colours only.
- There are no animations, so it is modelled fully deployed.
- Every material has metallic 0, roughness ≈ 0.18, and several carry an emissive term.
  It looks metallic in Blender only through gloss and the HDRI. It needs `materials=`
  overrides on the import row: `mirror_blinn` (gold mirror), `silver_mli`, `pinkmli`,
  `shld_pink*` (sunshield Kapton), `sa_edge_gold`. Decide what the bake does with the
  emissive term.

Variant (B) (1 MB, 99k triangles, better base colours) was rejected by eye in Blender.
