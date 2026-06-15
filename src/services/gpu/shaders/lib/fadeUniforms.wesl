// lib/fadeUniforms.wesl — shared per-handle opacity uniform.
//
// Every fadeable layer (point galaxy catalog, filament, scalar volume, label
// layer, always-on overlay) has a tiny 16-byte uniform buffer at
// '@group(1) @binding(0)' carrying the per-frame opacity value the
// FadeRegistry computed. The CPU side that owns the buffer + bind
// group + per-frame 'writeBuffer' lives in each renderer; this lib is
// the GPU half of the contract.
//
// ## Why one canonical struct
//
// Every consumer's 16-byte buffer has the same layout — one f32
// opacity + 12 bytes of pad. Sharing the struct across renderers makes
// drift structurally impossible: changing the layout here means every
// consumer's buffer-write code is wrong at the same time, surfaced as
// a single compile error in the shader linker.
//
// ## Why a fn at all if it's a one-liner
//
// 'color * opacity' would mistakenly attenuate RGB; we only want to
// scale alpha. The helper is intentionally scalar — 'applyFade(alpha,
// opacity) -> f32' — to match how the call sites multiply opacity into
// the scalar alpha alongside other modulators. Localising the
// "never let opacity attenuate RGB" invariant in one named helper
// gives it a documented home.
//
// Call this BEFORE the premultiplied-alpha output step (i.e. before
// folding 'rgb * alpha' into the return value).

struct FadeUniforms {
  // 0 → fully transparent, 1 → fully opaque (steady state).
  // Smoothstep-shaped on the CPU side by FadeController.
  opacity: f32,

  // Pad to 16-byte WebGPU-minimum uniform-buffer alignment. Never
  // written from the CPU side; never read here. Named individually
  // (rather than `_pad: vec3<f32>`) so a future field can repurpose
  // any one slot without alignment churn — each pad is a free 4-byte
  // f32/u32 slot. (Wider types like vec2<f32> or vec4 need 8 / 16-byte
  // alignment respectively and would require resizing the struct.)
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

// The alpha-only variant of fade — never let opacity attenuate RGB.
// Trivially 'alpha * opacity', wrapped so the invariant has a single
// documented home.
fn applyFade(alpha: f32, opacity: f32) -> f32 {
  return alpha * opacity;
}
