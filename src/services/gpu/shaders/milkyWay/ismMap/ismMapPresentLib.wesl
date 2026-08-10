// milkyWay/ismMap/ismMapPresentLib.wesl — shared log-polar resample + edge
// fade for the ISM-map diagnostic views (ismMapPresent.wesl,
// orientationPresent.wesl). Both intersect the camera ray with the disc
// plane (package::lib::util::rayPlaneY0), then need the SAME
// (r, theta) -> (azT, ringT) mapping into THEIR OWN log-radial grid so the
// two views agree on which texel a given hit lands in. Sibling to
// ismMapOrientationLib.wesl rather than an addition to it: that file is the
// GPU structure-tensor chain's own byte-layout contract (4 compute passes),
// a different consumer set from these two fullscreen presents.

const PI: f32 = 3.14159265358979;

// logPolarUv — hit.xz -> (azT, ringT) in [rMin, rMax]'s log-radial grid, or
// a zero vec3 with .z=0 when the hit falls outside it. WGSL has no tuple
// return, so validity rides a third component rather than an out-param.
fn logPolarUv(hit: vec3<f32>, rMin: f32, rMax: f32) -> vec3<f32> {
  let r = length(hit.xz);
  if (r < rMin || r > rMax) {
    return vec3<f32>(0.0, 0.0, 0.0);
  }
  let theta = atan2(hit.z, hit.x);
  let ringT = log(r / rMin) / log(rMax / rMin);
  let azT = theta / (2.0 * PI) + select(0.0, 1.0, theta < 0.0);
  return vec3<f32>(azT, ringT, 1.0);
}

// ismMapEdgeFade — fades the last few percent toward each radial edge so
// the map doesn't end in a hard ring; presentation, not physics.
fn ismMapEdgeFade(ringT: f32) -> f32 {
  return smoothstep(0.0, 0.03, ringT) * (1.0 - smoothstep(0.94, 1.0, ringT));
}
