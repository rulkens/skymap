// domeResample/io.wesl — the constant tables the resample's vertex and
// fragment stages share. See the dome-fisheye plan's 'Dome frame' table
// for the derivation; DOME_FACES here is the WGSL twin of
// 'src/data/rendering/domeFaces.ts' (pinned by domeFaces.parity.test.ts).

// Column-major, one face per row of this table: (right, up, forward) as
// three columns, literal numbers only -- domeFaces.parity.test.ts text-pins
// this against the TS table.
const DOME_FACES = array<mat3x3<f32>, 5>(
  mat3x3<f32>(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0),
  mat3x3<f32>(0.0, 0.0, 1.0, 0.0, 1.0, 0.0, -1.0, 0.0, 0.0),
  mat3x3<f32>(0.0, 0.0, -1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0),
  mat3x3<f32>(-1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, -1.0),
  mat3x3<f32>(1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 1.0, 0.0),
);

// The fisheye output is a MINIFICATION of every face: N/pi output px per
// radian against a face's N/2 on axis and N/(2 cos^2) off axis, a 1.6x to
// 3x shrink. One bilinear tap under-samples that, and a floor-sized star
// (1.5 face px) then pulses as the camera moves it across the output grid.
// A 3x3 box of taps over the pixel footprint covers the whole shrink range.
const TAPS_PER_AXIS: u32 = 3u;
