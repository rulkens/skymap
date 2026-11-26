# Horizon kind special-cased in five places

**Raised:** 2026-11-26, final review of the terrain horizon shadows PR (#1179).

## Problem

`'horizon'` is a derived texture kind: it has no raw source and uploads as a post lattice (no
flip, no mips). Neither axis has a home of its own, so each site tests the kind by name:

- Post-lattice upload: `src/layers/body/earth/render/earthRenderer.ts:276`,
  `src/layers/body/spheres/render/texturedBodyRenderer.ts:262`.
- No raw source: `tools/fetch/fetchTextures.ts:103`, `tools/textures/buildTextures.ts:559`,
  `tools/textures/buildSurfaceTiles.ts:80`.

The spec made `isLinearTextureKind` the one home for the linear-data axis; a second derived kind
would have to find all five sites by hand.

## Direction

One predicate per axis beside `isLinearTextureKind` (or a per-kind table that holds all three),
read by the five sites. Worth doing when a second derived kind appears, or sooner if a site is
missed once.
