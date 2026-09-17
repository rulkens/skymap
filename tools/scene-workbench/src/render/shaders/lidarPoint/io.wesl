// lidarPoint/io.wesl — the varyings the point quad hands its fragment stage.
// Each instance is a points.bin record verbatim (stride 16); the ASPRS class in
// '.w' rides along to hold that stride and is unread here.

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) color: vec3<f32>,
};
