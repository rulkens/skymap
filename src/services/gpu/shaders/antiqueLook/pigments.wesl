// antiqueLook/pigments.wesl — the colourist's box. A hand-coloured plate never
// carries a photograph's hue: every wash is one of a few period pigments,
// picked here by the hue direction of the scene colour beneath it.

const PIGMENT_COUNT: i32 = 8;
// The pigments a scene colour may be matched to; rose madder is laid only by name.
const SCENE_PIGMENT_COUNT: i32 = 7;
const PIGMENTS: array<vec3<f32>, 8> = array<vec3<f32>, 8>(
  vec3<f32>(0.42, 0.62, 0.50), // verdigris
  vec3<f32>(0.56, 0.60, 0.30), // sap green
  vec3<f32>(0.90, 0.74, 0.30), // gamboge
  vec3<f32>(0.86, 0.56, 0.42), // red lead, laid thin
  vec3<f32>(0.72, 0.28, 0.33), // carmine
  vec3<f32>(0.553, 0.604, 0.682), // smalt (a greyed blue, as smalt aged)
  vec3<f32>(0.86, 0.73, 0.44), // yellow ochre (a browner one read as scorching)
  vec3<f32>(0.86, 0.55, 0.58), // rose madder
);

fn luma(c: vec3<f32>) -> f32 {
  return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

// The pigment whose chroma direction best matches `c`'s; ochre when `c` is grey.
fn nearestPigment(c: vec3<f32>) -> vec3<f32> {
  let chroma = c - vec3<f32>(luma(c));
  let len = length(chroma);
  if (len < 1e-3) {
    return PIGMENTS[6];
  }
  // Runtime indices go into a var copy: naga, and maybe WebKit, refuse them on a const array.
  var box = PIGMENTS;
  var best = box[6];
  var bestDot = -2.0;
  for (var i = 0; i < SCENE_PIGMENT_COUNT; i++) {
    let pc = box[i] - vec3<f32>(luma(box[i]));
    let d = dot(chroma / len, normalize(pc));
    if (d > bestDot) {
      bestDot = d;
      best = box[i];
    }
  }
  return best;
}

// The outline colours a Dutch colourist laid on regions: verdigris, gamboge,
// carmine or smalt, by hue. Ochre and red lead read as browning (tea-stain) there.
fn regionPigment(c: vec3<f32>) -> vec3<f32> {
  let chroma = c - vec3<f32>(luma(c));
  let len = max(length(chroma), 1e-3);
  var picks = array<i32, 4>(0, 2, 4, 5);
  var box = PIGMENTS;
  var best = box[4];
  var bestDot = -2.0;
  for (var i = 0; i < 4; i++) {
    let pc = box[picks[i]] - vec3<f32>(luma(box[picks[i]]));
    let d = dot(chroma / len, normalize(pc));
    if (d > bestDot) {
      bestDot = d;
      best = box[picks[i]];
    }
  }
  return best;
}

fn pigmentAt(index: f32) -> vec3<f32> {
  var box = PIGMENTS;
  return box[clamp(i32(index), 0, PIGMENT_COUNT - 1)];
}

fn chromaOf(c: vec3<f32>) -> f32 {
  return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
}

// A watercolour wash is a filter on the paper: multiply by the pigment's
// transmittance, scaled so a full wash keeps the paper glowing through.
fn applyWash(paper: vec3<f32>, pigment: vec3<f32>, amount: f32) -> vec3<f32> {
  let transmit = pigment / max(pigment.r, max(pigment.g, pigment.b));
  return paper * mix(vec3<f32>(1.0), transmit, clamp(amount, 0.0, 1.0));
}
