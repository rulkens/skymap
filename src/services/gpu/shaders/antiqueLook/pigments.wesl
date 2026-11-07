// antiqueLook/pigments.wesl — the colourist's box. A hand-coloured plate never
// carries a photograph's hue: every wash is one of a few period pigments,
// picked here by the hue direction of the scene colour beneath it.

const PIGMENT_COUNT: i32 = 7;
const PIGMENTS: array<vec3<f32>, 7> = array<vec3<f32>, 7>(
  vec3<f32>(0.42, 0.62, 0.50), // verdigris
  vec3<f32>(0.56, 0.60, 0.30), // sap green
  vec3<f32>(0.90, 0.74, 0.30), // gamboge
  vec3<f32>(0.88, 0.48, 0.28), // red lead
  vec3<f32>(0.72, 0.28, 0.33), // carmine
  vec3<f32>(0.36, 0.45, 0.66), // azurite
  vec3<f32>(0.78, 0.60, 0.36), // ochre
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
  var best = PIGMENTS[6];
  var bestDot = -2.0;
  for (var i = 0; i < PIGMENT_COUNT; i++) {
    let pc = PIGMENTS[i] - vec3<f32>(luma(PIGMENTS[i]));
    let d = dot(chroma / len, normalize(pc));
    if (d > bestDot) {
      bestDot = d;
      best = PIGMENTS[i];
    }
  }
  return best;
}

fn pigmentAt(index: f32) -> vec3<f32> {
  return PIGMENTS[clamp(i32(index), 0, PIGMENT_COUNT - 1)];
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
