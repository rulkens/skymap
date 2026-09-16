// surfaceTile/surfaceLighting.wesl — what every tile fragment variant
// shares: the crossfaded atlas albedo, the height-cell normal and the LOD
// overlay. Bindings live in the entry files, so textures and uniform fields
// arrive as parameters (plain values, never a buffer struct by value).

import package::bodies::surfaceTile::lattice::latticePostGradient;

// Mirrored from 'EARTH_TILE_ATLAS_SIDE' (earthTileParams.ts), parity-tested
// in constants.parity.test.ts. Half an ATLAS texel in atlas uv: the inset
// that keeps a bilinear tap at a resolved rect's edge out of a DIFFERENT
// slot's pixels (the sampler's clamp-to-edge only guards the atlas's own edge).
const EARTH_TILE_ATLAS_SIDE: f32 = 8192.0;
const EARTH_TILE_ATLAS_HALF_TEXEL: f32 = 0.5 / EARTH_TILE_ATLAS_SIDE;

// Mirrored from 'EARTH_TILE_PX' (earthTileParams.ts), parity-tested. The
// atlas-uv width of a tile drawn from ITS OWN slot; the LOD overlay divides a
// resolved rect's width into it to recover how many levels the fallback walked.
const EARTH_TILE_PX: f32 = 512.0;
const TILE_SLOT_SCALE: f32 = EARTH_TILE_PX / EARTH_TILE_ATLAS_SIDE;

// The 'earth-lod-overlay' ladder: green = own leaf tile resident,
// yellow/orange/red = 1/2/3+ levels coarser. Flat bands, not a ramp: the
// ask is a small integer a reader can name at a glance.
fn earthLodOverlayColor(levelDelta: u32) -> vec3<f32> {
  if (levelDelta == 0u) {
    return vec3<f32>(0.10, 0.75, 0.15); // green
  } else if (levelDelta == 1u) {
    return vec3<f32>(0.95, 0.85, 0.05); // yellow
  } else if (levelDelta == 2u) {
    return vec3<f32>(0.95, 0.55, 0.05); // orange
  }
  return vec3<f32>(0.90, 0.10, 0.05); // red, 3+
}

// A deep ancestor fallback (levelDelta >= ~7) can flatten a rect to under one
// atlas texel; the raw half-texel inset would then push min past max, which
// clamp() leaves indeterminate -- so the inset is capped at half the rect.
fn resolveTileAtlasUv(origin: vec2<f32>, scale: vec2<f32>, uv: vec2<f32>) -> vec2<f32> {
  let raw = origin + uv * scale;
  let inset = min(vec2<f32>(EARTH_TILE_ATLAS_HALF_TEXEL), 0.5 * scale);
  return clamp(raw, origin + inset, origin + scale - inset);
}

// Crossfade the freshly-landed primary tile in over the coarser fallback. At
// fadeWeight 1 (both "fully faded in" and "no fallback resident", see io.wesl's
// PatchInstance) mix() returns the primary sample exactly. 'textureSampleLevel'
// because the atlas has one mip and its uv jumps at every slot seam.
fn tileAlbedo(
  atlas: texture_2d<f32>,
  atlasSampler: sampler,
  uv: vec2<f32>,
  primaryOrigin: vec2<f32>,
  primaryScale: vec2<f32>,
  fallbackOrigin: vec2<f32>,
  fallbackScale: vec2<f32>,
  fadeWeight: f32,
) -> vec3<f32> {
  let primaryUv = resolveTileAtlasUv(primaryOrigin, primaryScale, uv);
  let primaryAlbedo = textureSampleLevel(atlas, atlasSampler, primaryUv, 0.0).rgb;
  let fallbackUv = resolveTileAtlasUv(fallbackOrigin, fallbackScale, uv);
  let fallbackAlbedo = textureSampleLevel(atlas, atlasSampler, fallbackUv, 0.0).rgb;
  return mix(fallbackAlbedo, primaryAlbedo, fadeWeight);
}

// Shading normal from the four posts of the height cell 'uv' lies in: each
// post's own slope, interpolated across the cell, so the normal stays
// continuous over a post line (one gradient per cell drew every cell as a
// facet). Twin: src/utils/scene/surfaceNormalFromHeightCell.ts. 'uv.y' runs 0
// at the patch's NORTH edge, the lattice's own row order; 'Ng' is the
// normalized datum normal; 'heightLattice' is (origin.xy, cells) of the leaf.
fn tileShadingNormal(
  heightAtlas: texture_2d<f32>,
  uv: vec2<f32>,
  heightLattice: vec3<u32>,
  patchSpanRad: vec2<f32>,
  Ng: vec3<f32>,
  tangent: vec3<f32>,
  radiusM: f32,
) -> vec3<f32> {
  let cellsU = heightLattice.z;
  let cells = f32(cellsU);
  let col = uv.x * cells;
  let rowF = uv.y * cells;
  let i0 = clamp(floor(col), 0.0, cells - 1.0);
  let j0 = clamp(floor(rowF), 0.0, cells - 1.0);
  let cellU = col - i0;
  let cellV = rowF - j0;
  let nwPost = vec2<u32>(u32(i0), u32(j0));
  let gNW = latticePostGradient(heightAtlas, heightLattice.xy, nwPost, cellsU);
  let gNE = latticePostGradient(heightAtlas, heightLattice.xy, nwPost + vec2<u32>(1u, 0u), cellsU);
  let gSW = latticePostGradient(heightAtlas, heightLattice.xy, nwPost + vec2<u32>(0u, 1u), cellsU);
  let gSE = latticePostGradient(heightAtlas, heightLattice.xy, nwPost + vec2<u32>(1u, 1u), cellsU);
  let g = mix(mix(gNW, gNE, cellU), mix(gSW, gSE, cellU), cellV);

  // The 'max' is the polar guard: cos(lat) reaches 0 on the pole row.
  let lat = asin(clamp(Ng.z, -1.0, 1.0));
  let postSpacingNM = radiusM * patchSpanRad.y / cells;
  let postSpacingEM = max(radiusM * cos(lat) * patchSpanRad.x / cells, 1e-3);
  let dhdE = g.x / postSpacingEM;
  let dhdN = g.y / postSpacingNM;
  // The interpolated tangent is neither unit nor orthogonal to Ng any more,
  // so re-orthogonalize and re-normalize, as perturbNormal does.
  let eHat = normalize(tangent - Ng * dot(Ng, tangent));
  let nHat = normalize(cross(Ng, eHat));
  return normalize(Ng - dhdE * eHat - dhdN * nHat);
}

// A runtime lens ('lodOverlay' > 0.5), not a compile-time one, so it stays
// live. rectWidth / TILE_SLOT_SCALE is 2^-levelDelta by construction
// (resolveCutResidency halves the rect per level walked), which is why
// levelDelta is never carried as its own field.
fn tileLodOverlay(colour: vec3<f32>, rectWidth: f32, lodOverlay: f32) -> vec3<f32> {
  if (lodOverlay > 0.5) {
    let levelDelta = u32(round(log2(max(TILE_SLOT_SCALE / rectWidth, 1.0))));
    return mix(colour, earthLodOverlayColor(levelDelta), 0.6);
  }
  return colour;
}
