// earthSurfaceTile/lattice.wesl — the ONE statement of how a leaf addresses
// its height lattice: the sub-rect of atlas posts 'heightSlotOrigin' and
// 'heightCells' name (R14 — a leaf may be flattened into an ANCESTOR's slot).
// Both stages import it, so a vertex and the fragments over it can never
// disagree about a post. TWIN: src/utils/scene/latticeHeightSample.ts.

// The four posts of the cell whose NORTH-WEST corner is 'cell', as
// (NW, NE, SW, SE). Rows count SOUTH — the atlas's own order — so +1 on y is
// the south neighbour. 'stride' 2 walks every second post, which IS a
// one-level-coarser neighbour's own lattice (R1's strict decimation).
fn latticeCellM(tex: texture_2d<f32>, origin: vec2<u32>, cell: vec2<u32>, stride: u32) -> vec4<f32> {
  let nw = origin + cell;
  return vec4<f32>(
    textureLoad(tex, nw, 0).r,
    textureLoad(tex, nw + vec2<u32>(stride, 0u), 0).r,
    textureLoad(tex, nw + vec2<u32>(0u, stride), 0).r,
    textureLoad(tex, nw + vec2<u32>(stride, stride), 0).r,
  );
}

// Height slope at one post of the sub-rect, metres per POST, as (east,
// north): central differences, one-sided on the sub-rect's own edge rather
// than reading a neighbouring leaf's ground. Two tiles sharing an edge
// therefore take one-sided slopes from opposite sides of the same post -- a
// second-order disagreement a post wide, the price of no apron in the tile.
// TWIN: src/utils/scene/latticePostGradient.ts.
fn latticePostGradient(tex: texture_2d<f32>, origin: vec2<u32>, post: vec2<u32>, cells: u32) -> vec2<f32> {
  let west = max(post.x, 1u) - 1u;
  let east = min(post.x + 1u, cells);
  let north = max(post.y, 1u) - 1u;
  let south = min(post.y + 1u, cells);
  let hW = textureLoad(tex, origin + vec2<u32>(west, post.y), 0).r;
  let hE = textureLoad(tex, origin + vec2<u32>(east, post.y), 0).r;
  let hN = textureLoad(tex, origin + vec2<u32>(post.x, north), 0).r;
  let hS = textureLoad(tex, origin + vec2<u32>(post.x, south), 0).r;
  return vec2<f32>((hE - hW) / f32(east - west), (hN - hS) / f32(south - north));
}

// Bilinear height at lattice position 'p' (posts from 'origin', fractional
// once the leaf inherits a coarser ancestor's lattice). At a multiple of the
// stride both weights are 0 and the result is that post, bit-for-bit. The
// clamp is because a leaf seven levels up has ONE cell, where a doubled
// stride would read past the sub-rect into another leaf's ground (R15).
fn latticeHeightM(tex: texture_2d<f32>, origin: vec2<u32>, p: vec2<f32>, stride: f32, cells: f32) -> f32 {
  let s = min(stride, cells);
  let g = p / s;
  let q = floor(g);
  let f = g - q;
  let h = latticeCellM(tex, origin, vec2<u32>(q * s), u32(s));
  return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
}
