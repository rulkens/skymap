// earthSurfaceTile/lattice.wesl — the ONE statement of how a leaf addresses
// its height lattice: the sub-rect of atlas posts 'heightSlotOrigin' and
// 'heightCells' name (R14 — a leaf may be flattened into an ANCESTOR's slot).
// Both stages import it, so a vertex and the fragments over it can never
// disagree about a post. TWIN: src/utils/scene/latticeHeightSample.ts.

// The four posts of the cell whose NORTH-WEST corner is 'cell', as
// (NW, NE, SW, SE). Rows count SOUTH — the atlas's own order — so +1 on y is
// the south neighbour. 'stride' is the post step: 1 on a leaf's own lattice,
// 2 along a collapsed edge, where every second post IS the coarse
// neighbour's lattice (R1's strict decimation).
fn latticeCellM(tex: texture_2d<f32>, origin: vec2<u32>, cell: vec2<u32>, stride: u32) -> vec4<f32> {
  let nw = origin + cell;
  return vec4<f32>(
    textureLoad(tex, nw, 0).r,
    textureLoad(tex, nw + vec2<u32>(stride, 0u), 0).r,
    textureLoad(tex, nw + vec2<u32>(0u, stride), 0).r,
    textureLoad(tex, nw + vec2<u32>(stride, stride), 0).r,
  );
}

// Bilinear height at lattice position 'p' (posts from 'origin', fractional
// once the leaf inherits a coarser ancestor's lattice), on the sub-lattice of
// every stride-th post. Where 'p' is already a multiple of 'stride' both
// weights are 0 and the result is that post, bit-for-bit.
fn latticeHeightM(tex: texture_2d<f32>, origin: vec2<u32>, p: vec2<f32>, stride: f32) -> f32 {
  let g = p / stride;
  let q = floor(g);
  let f = g - q;
  let h = latticeCellM(tex, origin, vec2<u32>(q * stride), u32(stride));
  return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
}
