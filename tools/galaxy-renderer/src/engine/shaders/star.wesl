// star.wesl — the star billboard pass. Each star is one point expanded on
// the GPU into a camera-facing quad, shaded as a soft radial glow, and
// drawn with ADDITIVE blending (pipeline-side) so overlapping stars sum
// their light — the physically-correct model for unresolved point sources.
//
// The vertex stage does two subtle things beyond the billboard expansion:
//
//   1. Screen-size clamp. A star very close to the camera would otherwise
//      swell to fill the screen; we cap the quad's on-screen half-extent to
//      0.11 NDC by shrinking the corner displacement back along its own
//      direction. This keeps foreground stars bounded without touching
//      their brightness.
//
//   2. Flux-conserving level-of-detail. Rather than a hard 'draw if bigger
//      than N pixels' cull (which pops), each star fades in over a band as
//      its apparent size grows past a per-star hashed threshold, and the
//      survivors are brightened by 1/(fraction that faded in) so the TOTAL
//      light of a cluster stays roughly constant as you zoom — no sudden
//      brightening or dimming of the field.

struct Cam {
  viewProj: mat4x4<f32>,
  right: vec4<f32>,
  up: vec4<f32>,
  params: vec4<f32>, // x: sizeScale  y: starIntensity  z: lodApparent  w: cullBright
}
@group(0) @binding(0) var<uniform> cam: Cam;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
  @location(2) bright: f32,
}

@vertex
fn vs(@location(0) corner: vec2<f32>,
      @location(1) inPos: vec3<f32>,
      @location(2) inColor: vec3<f32>,
      @location(3) inSB: vec2<f32>) -> VSOut {
  var o: VSOut;
  let size = inSB.x * cam.params.x;
  let cClip = cam.viewProj * vec4<f32>(inPos, 1.0);
  let world = inPos + (cam.right.xyz * corner.x + cam.up.xyz * corner.y) * size;
  var kClip = cam.viewProj * vec4<f32>(world, 1.0);
  var apparent = 1.0;
  if (cClip.w > 0.0 && kClip.w > 0.0) {
    let cN = cClip.xy / cClip.w;
    var d = kClip.xy / kClip.w - cN;
    let l = length(d);
    apparent = l;
    if (l > 0.11) { d = d * (0.11 / l); kClip = vec4<f32>((cN + d) * kClip.w, kClip.z, kClip.w); }
  }
  var cull = inSB.y < cam.params.w;   // hard cull of the very faintest stars (quality knob)
  var boost = 1.0;
  let thr = cam.params.z;
  if (!cull && thr > 0.0) {
    // Flux-conserving LOD, no hard threshold: fade each star in over a band as its
    // on-screen size (a) grows past its hash; brighten survivors by 1/(fraction on).
    // The lower edge is 'h * 0.6', NOT 'h - 0.4' — a constant-width band goes
    // negative for h < 0.4, keeping ~40% of stars at a positive fade at any
    // distance (they never culled, so the whole field kept rasterizing into a few
    // screen tiles when the galaxy was small). A proportional edge stays strictly
    // positive so every star's fade reaches 0 as a -> 0; the hash is floored away
    // from 0 so the smoothstep edges can never coincide (indeterminate in WGSL).
    let a = apparent / thr;
    let h = max(fract(sin(dot(inPos, vec3<f32>(12.9898, 78.233, 37.719))) * 43758.5453), 1e-4);
    let fade = smoothstep(h * 0.6, h, a);
    if (fade <= 0.0) { cull = true; } else { boost = min(fade / min(1.0, a + 0.2), 3.0); }
  }
  if (cull) { o.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0); } else { o.pos = kClip; }
  o.uv = corner;
  o.color = inColor;
  o.bright = inSB.y * boost;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(i.uv, i.uv);
  if (r2 > 1.0) { discard; }
  let core = exp(-r2 * 5.0);
  let glow = exp(-r2 * 1.6) * 0.35;
  // subtract the value at the sprite edge so alpha reaches 0 smoothly (no hard rim)
  var a = max(0.0, (core + glow) - 0.0774) * cam.params.y;
  return vec4<f32>(i.color * i.bright * a, a);
}
