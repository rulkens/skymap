// lib/projectLabel.wesl — the WGSL twin of 'utils/labels/projectLabel.ts',
// 'liftedAnchor.ts' and 'tangentToward.ts', field for field; the
// 'projectLabel.parity' test holds the structs and constants equal.
// View space looks down +z, +y up. No function squares a raw Mpc offset:
// metre-range anchors (~1e-22 Mpc) flush to zero when squared in f32.

// Byte layout written by 'gpu/lib/outputProjectionUniform.ts'.
struct OutputProjection {
  viewFromWorld: mat3x3<f32>,
  camHi: vec3<f32>,
  focalPx: f32,
  camLo: vec3<f32>,
  pxScale: f32,
  up3: vec3<f32>,
  // 0 = pinhole; the dome PR adds equidistant.
  kind: u32,
  sizePx: vec2<f32>,
  centrePx: vec2<f32>,
};

struct ProjectedLabel {
  px: vec2<f32>,
  pxPerRad: f32,
  up: vec2<f32>,
  visible: bool,
};

// Must equal 'PARALLEL_TANGENT_EPS' in src/data/labels/parallelTangentEps.ts.
const PARALLEL_TANGENT_EPS: f32 = 0.000001;

const IMAGE_UP: vec2<f32> = vec2<f32>(0.0, -1.0);

// |offset| without squaring offset itself: scaled by its largest component first.
fn scaledLength(offset: vec3<f32>) -> f32 {
  let largest = max(abs(offset.x), max(abs(offset.y), abs(offset.z)));
  if (largest == 0.0) {
    return 0.0;
  }
  return largest * length(offset / largest);
}

fn projectLabel(viewVec: vec3<f32>, projection: OutputProjection) -> ProjectedLabel {
  if (!(viewVec.z > 0.0)) {
    return ProjectedLabel(vec2<f32>(0.0), 0.0, IMAGE_UP, false);
  }
  let tangent = viewVec.xy / viewVec.z;
  return ProjectedLabel(
    projection.centrePx + projection.focalPx * vec2<f32>(tangent.x, -tangent.y),
    projection.focalPx * length(vec3<f32>(tangent, 1.0)),
    IMAGE_UP,
    true,
  );
}

// Zero when 'dir' is parallel to 'toward' (no great circle between them).
fn tangentToward(dir: vec3<f32>, toward: vec3<f32>) -> vec3<f32> {
  let across = toward - dot(dir, toward) * dir;
  let len = length(across);
  if (len < PARALLEL_TANGENT_EPS) {
    return vec3<f32>(0.0);
  }
  return across / len;
}

fn liftedAnchor(viewVec: vec3<f32>, radiusMpc: f32, gapPx: f32, projection: OutputProjection) -> ProjectedLabel {
  let len = scaledLength(viewVec);
  let dir = viewVec / len;
  let angle = asin(clamp(radiusMpc / len, 0.0, 1.0));
  let tangent = tangentToward(dir, projection.up3);
  var liftPx = gapPx * projection.pxScale;
  var projected: ProjectedLabel;
  if (all(tangent == vec3<f32>(0.0))) {
    // Looking along up3: no turn is defined, so the angular lift goes on screen.
    projected = projectLabel(dir, projection);
    liftPx += angle * projected.pxPerRad;
  } else {
    projected = projectLabel(cos(angle) * dir + sin(angle) * tangent, projection);
  }
  if (projected.visible) {
    projected.px += projected.up * liftPx;
  }
  return projected;
}
