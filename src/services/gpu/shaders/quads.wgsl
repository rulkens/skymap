// quads.wgsl — billboard galaxy thumbnails sampled from a single atlas.
//
// Run after the existing point pass.  Each instance is one textured
// quad whose world-space center matches a galaxy and whose size is
// computed from the engine's apparent-size threshold logic.  We bind
// the atlas texture + sampler in group(0) so the engine can swap the
// bind group cheaply when more thumbnails arrive.

// Camera + viewport.  Shape mirrors the points-pass uniforms enough to
// share the same conceptual binding even though several points-only
// fields (brightness / selectedIndex / etc) aren't carried here.
//
// `camPosWorld` + `pxPerRad` were added when the original
// "project-a-unit-X-offset" billboard sizing turned out to depend on
// camera orientation (orbiting a galaxy made the quad visibly shrink
// or grow as the world-X axis rotated relative to the view direction).
// The replacement computes each quad's apparent angular radius from
// `length(instance.posSize.xyz - camPosWorld)` and converts to screen
// pixels via `pxPerRad = viewport.y / (2 · tan(fovY / 2))`.  Identical
// approach to points.wgsl — see that file for the derivation.
struct Uniforms {
  viewProj: mat4x4<f32>,
  viewport: vec2<f32>,
  _pad0: f32,
  _pad1: f32,
  camPosWorld: vec3<f32>,
  pxPerRad: f32,
};

// Per-instance attributes.  Two vec4s — first packs (xyz, sizeWorld),
// second is the uv rect.  Both naturally 16-byte aligned.
struct InstanceIn {
  @location(0) posSize: vec4<f32>,
  @location(1) uvRect:  vec4<f32>,
};

struct VsOut {
  @builtin(position) clipPos:   vec4<f32>,
  // UV inside the atlas — used to sample the bitmap.  Maps the slot's
  // sub-rectangle of the 2048×2048 atlas.
  @location(0)       atlasUv:   vec2<f32>,
  // UV inside the corner-local [0, 1]² unit square — used to compute
  // the radial alpha mask in `fs`.  Independent of atlasUv because the
  // atlas slot might not occupy the full corner range when slot UV
  // rectangles get clamped or padded.  Threading both lets us decouple
  // "which texel to sample" from "where am I in the quad shape".
  @location(1)       cornerUv:  vec2<f32>,
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
  // clip space by a fixed pixel half-extent — same screen-aligned
  // billboard scheme as points.wgsl.  Always face-the-camera regardless
  // of the camera's orientation.
  let centerClip = u.viewProj * vec4<f32>(instance.posSize.xyz, 1.0);

  // ── ANGULAR-SIZE → PIXEL HALF-EXTENT ─────────────────────────────────────
  //
  // The previous implementation tried to size the quad by projecting a
  // 1-Mpc-along-world-X offset point and measuring the clip-space delta —
  // which is correct only when world-X is roughly perpendicular to the
  // view direction.  As the camera orbited a galaxy, world-X rotated
  // toward / away from the view axis and the projected length expanded
  // and contracted, making the quad apparently shrink and grow.  Bug
  // fixed by computing the on-screen radius directly from the world-space
  // distance and the camera's pixel-per-radian factor (independent of
  // camera orientation).
  //
  //   distanceMpc       = ‖ instance.xyz − camPosWorld ‖
  //   angularRadius_rad = (sizeWorldMpc * 0.5) / distanceMpc
  //   halfPixels        = angularRadius_rad · pxPerRad
  //
  // We guard distanceMpc against 0 (camera parked exactly on a galaxy
  // center, possible during focus-tween) so we don't divide-by-zero.
  let toGalaxy   = instance.posSize.xyz - u.camPosWorld;
  let distanceMpc = max(length(toGalaxy), 0.001);
  let halfWorld   = instance.posSize.w * 0.5;
  let halfPixels  = (halfWorld / distanceMpc) * u.pxPerRad;

  // Convert pixels to clip-space half-extent.  As in points.wgsl, we
  // multiply by `centerClip.w` to cancel the perspective divide so the
  // billboard ends up exactly `halfPixels` on screen regardless of
  // depth.
  let pxToClip = vec2<f32>(2.0 / u.viewport.x, 2.0 / u.viewport.y);

  var out: VsOut;
  out.clipPos = vec4<f32>(
    centerClip.xy + corner * halfPixels * pxToClip * centerClip.w,
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
  out.atlasUv = mix(instance.uvRect.xy, instance.uvRect.zw, uvLocal);
  // Forward the corner-local UV to the FS so it can compute the
  // radial mask without re-deriving it from clip-space coords.
  out.cornerUv = cornerUv;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let rgba = textureSample(atlasTex, atlasSmp, in.atlasUv);

  // Radial mask centred on the slot middle (cornerUv = 0.5, 0.5).
  // Fades from 1.0 inside r=0.4 to 0.0 at r≥0.5 via smoothstep.
  // Why this shape?  A galaxy thumbnail is mostly bulge in the center
  // and dim sky / image-edge artefacts at the corners — the corners
  // are exactly the part we want to hide so the quad blends into the
  // surrounding dot field instead of showing a hard JPEG square.
  // 0.4 → 0.5 gives a ~10% transition band, soft enough to look like
  // a Gaussian halo rather than a clipped circle.
  let r = length(in.cornerUv - vec2<f32>(0.5, 0.5));
  let mask = 1.0 - smoothstep(0.4, 0.5, r);
  let alpha = rgba.a * mask;
  // Premultiplied-alpha output — required by the project's blend
  // configuration (see device.ts `alphaMode: 'premultiplied'`).
  return vec4<f32>(rgba.rgb * alpha, alpha);
}
