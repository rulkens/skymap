// proceduralDisks/pickFragment.wesl — offscreen r32uint picking fragment
// for the procedural-disk impostor pipeline.
//
// Pick sibling of 'fragment.wesl'. Where the visual fragment shades a
// two-component brightness profile into the rgba16float HDR target, this
// one writes the packed galaxy identity into the r32uint pick texture so
// the JS hover/click path can map a cursor pixel back to (source, localIdx).
//
// ## Shape contract
//
// The discard condition 'length(in.uv) > 1.0' is identical to the one in
// 'fragment.wesl'. This makes the pick surface exactly the disk the debug
// ring traces — no forgiveness margin, no shrink. A cursor pixel that hits
// a visible disk fragment will always hit the pick surface too, and vice
// versa.
//
// ## Why the +offset
//
// The r32uint pick texture is cleared to 0 before the pass. Writing the
// raw packed id would make the galaxy with sourceCode = 0 AND localIdx = 0
// indistinguishable from an unwritten pixel. Adding PICK_SENTINEL_OFFSET (=
// 1) shifts the entire range up by one so 0 remains the unambiguous 'no
// hit' sentinel. The JS decoder subtracts the offset before unpacking.
//
// ## No bindings declared here
//
// 'fsPick' only reads VsOut fields — no uniforms consumed. The vertex stage
// in 'vertex.wesl' owns all @group declarations; the pick pipeline on the
// JS side must still bind the same groups (WebGPU pipeline layout requires
// it), but this fragment module doesn't redeclare them. Same pattern as
// 'points/pickFragment.wesl'.

import package::proceduralDisks::io::VsOut;
import package::lib::selectionEncoding::PICK_SENTINEL_OFFSET;

@fragment
fn fsPick(in: VsOut) -> @location(0) vec4<u32> {
  // Exact unit-circle discard — matches the visual fragment's 'r > 1.0'
  // test so the pick edge equals the visible disk edge.
  if (length(in.uv) > 1.0) { discard; }

  // Write the 1-based packed identity into the r channel. g/b/a are unused;
  // the JS pick decoder reads only r. The +offset keeps 0 as 'no hit'.
  return vec4<u32>(in.pickId + PICK_SENTINEL_OFFSET, 0u, 0u, 0u);
}
