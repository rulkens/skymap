// antiqueLook/captionHalo.wesl — the paper an engraver left round his lettering.
// He cut the ground away before lettering over the work, so hatching, contours
// and rulings stop short of every caption, and the colourist, following the
// engraved lines, stopped there too. Overlay alpha is each caption's fill plus
// its dark contrast outline; the halo grows that by REACH print units.

const REACH = 3.0;

// Eight directions at two radii: a single ring of taps lets a thin stroke or a
// short letter fall between them, and the halo shows the ink through in a notch.
const DIRS = array<vec2<f32>, 8>(
  vec2<f32>(1.0, 0.0), vec2<f32>(0.7071068, 0.7071068),
  vec2<f32>(0.0, 1.0), vec2<f32>(-0.7071068, 0.7071068),
  vec2<f32>(-1.0, 0.0), vec2<f32>(-0.7071068, -0.7071068),
  vec2<f32>(0.0, -1.0), vec2<f32>(0.7071068, -0.7071068),
);

// 0 on the open plate, 1 where a caption's knock-out clears it to paper.
fn captionHalo(overlay: texture_2d<f32>, ip: vec2<i32>, unit: f32, centreAlpha: f32) -> f32 {
  let last = vec2<i32>(textureDimensions(overlay)) - 1;
  var a = centreAlpha;
  // A var copy: naga, and maybe WebKit, refuse a runtime index into a const array.
  var dirs = DIRS;
  for (var k = 0; k < 8; k++) {
    let near = ip + vec2<i32>(round(dirs[k] * (0.5 * REACH * unit)));
    let far = ip + vec2<i32>(round(dirs[k] * (REACH * unit)));
    a = max(a, textureLoad(overlay, clamp(near, vec2<i32>(0), last), 0).a);
    a = max(a, textureLoad(overlay, clamp(far, vec2<i32>(0), last), 0).a);
  }
  return smoothstep(0.05, 0.3, a);
}

// Letter spacing wider than the halo (a sea's spaced capitals, MARE TRANQVILLITATIS)
// leaves the work showing between letters: a pixel with lettering within BRIDGE units
// on both sides along the line of type is cleared too, so a word sits on one knock-out.
const BRIDGE = vec3<f32>(2.0, 4.5, 7.5);

fn captionBridge(overlay: texture_2d<f32>, ip: vec2<i32>, unit: f32) -> f32 {
  let last = vec2<i32>(textureDimensions(overlay)) - 1;
  var left = 0.0;
  var right = 0.0;
  for (var k = 0; k < 3; k++) {
    let o = vec2<i32>(i32(round(BRIDGE[k] * unit)), 0);
    left = max(left, textureLoad(overlay, clamp(ip - o, vec2<i32>(0), last), 0).a);
    right = max(right, textureLoad(overlay, clamp(ip + o, vec2<i32>(0), last), 0).a);
  }
  return smoothstep(0.05, 0.3, min(left, right));
}
