// debugLines/fragment.wesl — soft-edged thick-line fragment stage: the
// premultiplied colour times a one-pixel anti-aliased falloff across the
// line (uv.y runs 0..1 over its width; 'fwidth' sizes the band).

import package::debugLines::io::VsOut;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let edgeDist = abs(input.uv.y - 0.5) * 2.0;
  let antialiasWidth = fwidth(edgeDist);
  return input.color * (1.0 - smoothstep(1.0 - antialiasWidth, 1.0, edgeDist));
}
