// The "Colour by level" view's hues by the march's `level`: DENSITY_LEVEL_LEGEND's hexes in linear
// light, its order (settled, into, out, base mip 0, 1, 2+). densityLevelTints.parity pins the pair.

const LEVEL_TINTS = array<vec3<f32>, 6>(
  vec3<f32>(0.871, 0.776, 0.054), vec3<f32>(0.791, 0.347, 0.0), vec3<f32>(0.604, 0.191, 0.386),
  vec3<f32>(0.0, 0.342, 0.171), vec3<f32>(0.093, 0.456, 0.815), vec3<f32>(0.0, 0.168, 0.445),
);
