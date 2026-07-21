// bloom/io.wesl — the bloom family's fullscreen 'covering triangle' vertex
// stage plus its vertex-to-fragment struct.
//
// ## Why this vertex is family-local, not a shared import
//
// The galaxy-renderer dev tool this bloom stack was ported from imports its
// fullscreen vertex from 'package::lib::fullscreenTri' — but that module is
// the TOOL's, and the main app deliberately does NOT share it. The WESL house
// convention here is family-locality: each shader family owns (duplicates) its
// own fullscreen vertex, exactly as 'compositor/vertex.wesl' does. The reasons:
//   - WESL has no global bindings, so a 'shared' vertex buys almost nothing —
//     each fragment file still redeclares its own @group/@binding block.
//   - A per-family copy keeps each family's linked shader module built from
//     disjoint source, so a change in one family can never silently perturb
//     another's compiled output.
// The vertex math is ~6 lines; the coupling a shared import would introduce
// costs more than the duplication saves.
//
// ## The covering-triangle trick
//
// vertex_index 0,1,2 produce (x,y) of (0,0), (2,0), (0,2), which map to
// clip-space (-1,1), (3,1), (-1,-3): a single triangle covering [-1,1]² with
// its off-screen corners clipped for free (no shared internal edge, so no
// centre-sample rasteriser drop-outs that a two-triangle quad can suffer).

// ── vertex-to-fragment interface ────────────────────────────────────
//
// 'pos' is the clip-space builtin; 'uv' is the [0,1]² sampling coordinate the
// fragment stages use to read the source texture.
struct FullscreenOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

fn fullscreenVertex(vi: u32) -> FullscreenOut {
  // 'x = ((vi << 1) & 2)' and 'y = (vi & 2)' yield the 0/2 pattern above.
  let x = f32(((vi << 1u) & 2u));
  let y = f32(vi & 2u);
  var out: FullscreenOut;
  out.pos = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(x, y);
  return out;
}
