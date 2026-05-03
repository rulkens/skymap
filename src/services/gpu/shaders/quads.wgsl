// quads.wgsl — billboard galaxy thumbnails sampled from a single atlas.
//
// Run after the existing point pass.  Each instance is one textured
// quad whose world-space center matches a galaxy and whose size is
// computed from the engine's apparent-size threshold logic.  We bind
// the atlas texture + sampler in group(0) so the engine can swap the
// bind group cheaply when more thumbnails arrive.

// Camera + viewport.  We share the same struct shape as the existing
// points pass for consistency, even though we don't need brightness /
// selectedIndex / etc here.
struct Uniforms {
  viewProj: mat4x4<f32>,
  viewport: vec2<f32>,
  _pad0: f32,
  _pad1: f32,
};

// Per-instance attributes.  Two vec4s — first packs (xyz, sizeWorld),
// second is the uv rect.  Both naturally 16-byte aligned.
struct InstanceIn {
  @location(0) posSize: vec4<f32>,
  @location(1) uvRect:  vec4<f32>,
};

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  @location(0)       uv:      vec2<f32>,
};

@group(0) @binding(0) var<uniform> u:        Uniforms;
@group(0) @binding(1) var          atlasTex: texture_2d<f32>;
@group(0) @binding(2) var          atlasSmp: sampler;

// Hard-coded quad corners.  The vertex shader is invoked with
// vertex_index 0..5 (two triangles), and we look up the corner from
// this table.  Saves an index buffer + a vertex buffer for static
// geometry.
const CORNERS = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0,  1.0),
);

@vertex
fn vs(@builtin(vertex_index) vid: u32, instance: InstanceIn) -> VsOut {
  let corner = CORNERS[vid];

  // Project the world-space center first.  We then offset the corner in
  // clip space by half the quad's projected size, which keeps the quad
  // axis-aligned to the screen (a billboard) regardless of camera
  // orientation.  This is the cheapest billboarding scheme and works
  // because we're sampling a sky-plane projection (a 2D image), not
  // rendering a 3D galaxy.
  let centerClip = u.viewProj * vec4<f32>(instance.posSize.xyz, 1.0);

  // To get the on-screen size of 1 Mpc at this depth, project a point
  // 1 Mpc to the right of center and measure the clip-space delta.
  // Multiply by sizeWorld/2 to get the half-extent of the quad.
  let rightWorld = instance.posSize.xyz + vec3<f32>(1.0, 0.0, 0.0);
  let rightClip  = u.viewProj * vec4<f32>(rightWorld, 1.0);
  let halfSizeClip =
    (rightClip.xy / rightClip.w - centerClip.xy / centerClip.w) * (instance.posSize.w * 0.5);
  // Use the magnitude as a uniform scale so the quad stays square even
  // if the projection skews (e.g. wide field of view).
  let half = length(halfSizeClip);

  var out: VsOut;
  out.clipPos = vec4<f32>(
    centerClip.xy + corner * half * centerClip.w,
    centerClip.z,
    centerClip.w,
  );

  // UV: corner is in [-1, 1]; remap to [0, 1] then to the slot's atlas
  // rect.  Flip V so the texture isn't upside down — `flipY: false` on
  // the atlas upload preserves the natural ImageBitmap orientation
  // (top-down), and our UV convention here puts v=0 at the top of the
  // atlas.
  let cornerUv = (corner + vec2<f32>(1.0, 1.0)) * 0.5;
  let uvLocal = vec2<f32>(cornerUv.x, 1.0 - cornerUv.y);
  out.uv = mix(instance.uvRect.xy, instance.uvRect.zw, uvLocal);
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let rgba = textureSample(atlasTex, atlasSmp, in.uv);
  // Premultiplied-alpha output: lets quads blend correctly under the
  // additive points layer above without darkening the background.
  // Task 11 adds a radial alpha falloff so the JPEG-square outline
  // softens into the dot field; for v1 we accept the hard edge.
  return vec4<f32>(rgba.rgb * rgba.a, rgba.a);
}
