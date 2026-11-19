// lib/projectLabel.wesl — the WGSL twin of 'utils/labels/projectLabel.ts',
// 'liftedAnchor.ts' and 'tangentToward.ts', field for field; the
// 'projectLabel.parity' test holds the structs and constants equal.
// Pinhole view space looks down +z, +y up; equidistant view space is the dome
// frame (+y zenith, +z front, +x right). No function squares a raw Mpc offset:
// metre-range anchors (~1e-22 Mpc) flush to zero when squared in f32.

// Byte layout written by 'gpu/lib/outputProjectionUniform.ts'.
struct OutputProjection {
  viewFromWorld: mat3x3<f32>,
  camHi: vec3<f32>,
  focalPx: f32,
  camLo: vec3<f32>,
  pxScale: f32,
  up3: vec3<f32>,
  // KIND_PINHOLE or KIND_EQUIDISTANT.
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

// Must equal 'KIND_CODE' in 'gpu/lib/outputProjectionUniform.ts'.
const KIND_PINHOLE: u32 = 0u;
const KIND_EQUIDISTANT: u32 = 1u;

// Must equal 'PARALLEL_TANGENT_EPS' in src/data/labels/parallelTangentEps.ts.
const PARALLEL_TANGENT_EPS: f32 = 0.000001;

const IMAGE_UP: vec2<f32> = vec2<f32>(0.0, -1.0);

const HALF_PI: f32 = 1.5707963;

// |offset| without squaring offset itself: scaled by its largest component first.
fn scaledLength(offset: vec3<f32>) -> f32 {
  let largest = max(abs(offset.x), max(abs(offset.y), abs(offset.z)));
  if (largest == 0.0) {
    return 0.0;
  }
  return largest * length(offset / largest);
}

// The dome's fisheye: the zenith at the centre, the horizon stretched over the
// canvas edge as the resample draws it (front at the bottom), up pointing back
// at the zenith in px. Sees the upper half of the dome frame.
fn projectEquidistant(viewVec: vec3<f32>, projection: OutputProjection) -> ProjectedLabel {
  let largest = max(abs(viewVec.x), max(abs(viewVec.y), abs(viewVec.z)));
  if (largest == 0.0 || viewVec.y < 0.0) {
    return ProjectedLabel(vec2<f32>(0.0), 0.0, IMAGE_UP, false);
  }
  let scaled = viewVec / largest;
  let horizontal = length(scaled.xz);
  if (horizontal < PARALLEL_TANGENT_EPS) {
    return ProjectedLabel(projection.centrePx, projection.focalPx, IMAGE_UP, true);
  }
  // Where this bearing meets the horizon, px from the centre: one radius per axis.
  let edgePx = 0.5 * projection.sizePx * scaled.xz / horizontal;
  // Angle from the zenith by atan2: an arccosine loses all precision near it.
  let horizonFraction = atan2(horizontal, scaled.y) / HALF_PI;
  return ProjectedLabel(
    projection.centrePx + horizonFraction * edgePx,
    projection.focalPx,
    -normalize(edgePx),
    true,
  );
}

fn projectLabel(viewVec: vec3<f32>, projection: OutputProjection) -> ProjectedLabel {
  if (projection.kind == KIND_EQUIDISTANT) {
    return projectEquidistant(viewVec, projection);
  }
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

// Turned 'liftRadii' angular radii toward up3 (at most 90 degrees), then
// pushed along image-up until it stands 'minLiftPx' above the subject.
fn liftedAnchor(viewVec: vec3<f32>, radiusMpc: f32, liftRadii: f32, minLiftPx: f32, projection: OutputProjection) -> ProjectedLabel {
  let len = scaledLength(viewVec);
  let dir = viewVec / len;
  let angle = min(liftRadii * asin(clamp(radiusMpc / len, 0.0, 1.0)), HALF_PI);
  let floorPx = minLiftPx * projection.pxScale;
  let tangent = tangentToward(dir, projection.up3);
  let subject = projectLabel(dir, projection);
  var liftPx: f32;
  var projected: ProjectedLabel;
  if (all(tangent == vec3<f32>(0.0))) {
    // Looking along up3: no turn is defined, so the angular lift goes on screen.
    projected = subject;
    liftPx = max(angle * projected.pxPerRad, floorPx);
  } else {
    projected = projectLabel(cos(angle) * dir + sin(angle) * tangent, projection);
    let moved = select(0.0, distance(projected.px, subject.px), subject.visible);
    liftPx = max(floorPx - moved, 0.0);
  }
  if (projected.visible) {
    projected.px += projected.up * liftPx;
  }
  return projected;
}
