// mcpm/vertex.wesl — the fullscreen triangle every mcpm screen-space pass draws with.
//
// 'uv' is the [0,1] screen coordinate with +v DOWN; a fragment that wants clip space
// (the raymarch's ray setup) undoes the flip as 'vec2(uv.x * 2 - 1, 1 - uv.y * 2)'.
// blit.wesl's varying is +v UP and 'fsTonemap' flips at sample time, so swapping the blit
// onto this vertex shader must drop that '1.0 - i.uv.y' or the resolve flips vertically.
//
// The entry point is declared here rather than imported from lib/fullscreenTri: the
// linker gives no guarantee an imported entry point keeps its name, and the pipeline
// looks it up by string.

struct McpmVsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> McpmVsOut {
  var corners = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0)
  );
  let xy = corners[vi];
  var out: McpmVsOut;
  out.pos = vec4<f32>(xy, 0.0, 1.0);
  out.uv = vec2<f32>((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return out;
}
