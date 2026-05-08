// lib/cloudFade.wesl — shared per-cloud opacity uniform + fade helper.
//
// Each renderable cloud (per-source point cloud, the cosmic-web filament
// skeleton, future overlays) has a tiny 16-byte uniform buffer at
// '@group(1) @binding(0)' carrying the smoothstep-shaped fade-in
// opacity. The CPU side that owns the buffer + bind group + per-frame
// 'writeBuffer' lives in 'src/services/gpu/resources/cloudFade.ts'; this lib is
// the GPU half of the same contract.
//
// ## Why a SHARED struct
//
// The CPU-side 'CloudFade' class (services/gpu/resources/cloudFade.ts) emits a
// SINGLE 16-byte layout — 'opacity: f32 + sourceCode: u32 + 8 bytes pad'
// — for every consumer. Both the points renderer and the filaments
// renderer bind buffers built by the same class, and the bytes are
// byte-identical regardless of consumer. A previous revision kept two
// shader-side structs (points named slot 1 'sourceCode', filaments
// named it '_pad0') to express the fact that filaments doesn't read
// sourceCode today. That divergence was fictional: it didn't change a
// single byte of the buffer or its alignment, it just made the shader
// declarations look different from each other while the CPU-side
// producer was identical. Keeping mismatched shader structs over an
// identical CPU layout is the kind of drift that quietly rots — when
// filaments DOES want to opt into sourceCode (e.g. to encode
// per-skeleton identity into a future filament pick output), the
// renaming + type-juggling would have to happen anyway.
//
// So: one struct, exported here, imported by both renderers. Filaments
// simply ignores 'sourceCode' in its fragment stage; nothing prevents
// it from reading the slot later. The pad fields are named '_pad1' /
// '_pad2' to keep them obviously-unused at the call site.
//
// ## Why a fn at all if it's a one-liner
//
// 'color * opacity' would mistakenly attenuate RGB; we only want to
// scale alpha. Newcomers have made this mistake before. The helper is
// intentionally scalar — 'applyCloudFade(alpha, opacity) -> f32' — to
// match how the call sites actually multiply opacity into a scalar
// alpha alongside other modulators ('angWeight', 'depthFade',
// 'pointAlphaMult', 'edgeFade', 'densityBoost', etc.). An earlier
// revision used a vec4-in/vec4-out signature; that forced both
// fragment stages to construct a 'vec4(rgb, alpha)', call the helper,
// then re-extract '.rgb' / '.a' for the premultiply step. Pure
// ceremony, no extra safety. The scalar form is honest about what's
// happening: opacity is one of several multiplicative alpha terms,
// and this helper is the documented place that says 'never let
// opacity attenuate RGB'.
//
// Call this BEFORE the premultiplied-alpha output step (i.e. before
// folding 'rgb * alpha' into the return value). Both points.wesl and
// filaments.wesl render with 'alphaMode: premultiplied' on the canvas,
// so each fragment ends with 'vec4(rgb * fadedAlpha, fadedAlpha)'.
// Multiplication is commutative, so factoring opacity into 'alpha'
// before the premultiply is identical to scaling the final pre-
// multiplied colour — but doing it here localises the docblock on
// what the opacity uniform actually means.

struct CloudUniforms {
  // 0 → fully transparent (just uploaded), 1 → fully opaque (steady
  // state). Smoothstep-shaped on the CPU side over ~600 ms.
  opacity: f32,

  // 5-bit Source enum value for this cloud. Read by the points vertex
  // stage to compose '(sourceCode << 27u) | instance_index' for the
  // selection-halo + pick-output paths. Filaments doesn't read this
  // slot today, but the CPU producer ('CloudFade.writeFrame' in
  // services/gpu/resources/cloudFade.ts) writes it for every cloud regardless,
  // so the byte is already there for a future filament feature to
  // opt into.
  sourceCode: u32,

  // Pad to 16-byte WebGPU-minimum uniform-buffer alignment. Never
  // written from the CPU side; never read here.
  _pad1: f32,
  _pad2: f32,
};

// The alpha-only variant of cloud fade — never let opacity attenuate
// RGB. Trivially 'alpha * opacity', wrapped so the invariant has a
// single documented home.
fn applyCloudFade(alpha: f32, opacity: f32) -> f32 {
  return alpha * opacity;
}
