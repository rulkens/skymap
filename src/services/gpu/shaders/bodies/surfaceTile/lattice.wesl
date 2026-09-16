// surfaceTile/lattice.wesl — the ONE statement of how a leaf addresses
// its height lattice: the sub-rect of atlas posts 'heightSlotOrigin' and
// 'heightCells' name (R14 — a leaf may be flattened into an ANCESTOR's slot).
// Both stages import it, so a vertex and the fragments over it can never
// disagree about a post. TWIN: src/utils/scene/latticeHeightSample.ts.

// Mirror HEIGHT_CODE_OFFSET_M / HEIGHT_CODE_STEP_M (heightTileFormat.ts), parity-tested.
const HEIGHT_CODE_OFFSET_M: f32 = -32768.0;
const HEIGHT_CODE_STEP_M: f32 = 0.1;
const TEXEL_BYTE_MAX: f32 = 255.0;

// Terrain-RGB: exact bytes via textureLoad (never a sampler), then
// OFFSET + code * STEP; code < 2^24 is exact in f32. Rounded, never truncated,
// so both tiles on a shared edge decode a post to the same f32. May differ
// from the CPU's codeHeightM by about one f32 ulp.
fn postHeightM(tex: texture_2d<f32>, coord: vec2<u32>) -> f32 {
  let b = vec3<u32>(round(textureLoad(tex, coord, 0).rgb * TEXEL_BYTE_MAX));
  let code = (b.r << 16u) | (b.g << 8u) | b.b;
  return HEIGHT_CODE_OFFSET_M + f32(code) * HEIGHT_CODE_STEP_M;
}

// The four posts of the cell whose NORTH-WEST corner is 'cell', as
// (NW, NE, SW, SE). Rows count SOUTH — the atlas's own order — so +1 on y is
// the south neighbour. 'stride' 2 walks every second post, which IS a
// one-level-coarser neighbour's own lattice (R1's strict decimation).
fn latticeCellM(tex: texture_2d<f32>, origin: vec2<u32>, cell: vec2<u32>, stride: u32) -> vec4<f32> {
  let nw = origin + cell;
  return vec4<f32>(
    postHeightM(tex, nw),
    postHeightM(tex, nw + vec2<u32>(stride, 0u)),
    postHeightM(tex, nw + vec2<u32>(0u, stride)),
    postHeightM(tex, nw + vec2<u32>(stride, stride)),
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
  let hW = postHeightM(tex, origin + vec2<u32>(west, post.y));
  let hE = postHeightM(tex, origin + vec2<u32>(east, post.y));
  let hN = postHeightM(tex, origin + vec2<u32>(post.x, north));
  let hS = postHeightM(tex, origin + vec2<u32>(post.x, south));
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
