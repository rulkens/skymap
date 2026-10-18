// points/vertex.wesl — the flat points pipeline's vertex entry point: the
// bindings and the vertex-buffer attributes, handed to 'galaxyPointVertex'
// (points/vertexBody.wesl), which holds the whole stage.
//
// Shared by both renderers: the visual GalaxyPointRenderer compiles this
// alongside 'colorFragment.wesl' for the additive-blended display
// pass; the offscreen GalaxyPickRenderer compiles it alongside
// 'pickFragment.wesl' for the r32uint picking pass. Both pipelines
// build their OWN GPUShaderModule from this same source — never share
// a module across pipelines, because WebGPU's 'auto' bind-group-layout
// system gives each pipeline its own pipeline-local layout identity.
//
// ## Why the bindings are declared here, not in io.wesl
//
// WESL has no global state — '@group(N) @binding(M) var<uniform> X' is
// a module-local declaration that cannot be exported across modules. We
// re-declare 'u' here using the structs imported from 'points/io.wesl',
// so the layout numbers (and the underlying byte layout via the
// imported 'Uniforms' struct) are guaranteed to match the colorFragment
// + pickFragment counterparts. WGSL accepts the same '@group/@binding'
// pair in multiple compiled modules so long as the layout is identical;
// importing one authoritative struct makes drift structurally impossible.
//
// pickFragment.wesl declares no bindings of its own — this vertex
// module references '@group(0)' (Uniforms) and '@group(2)' (per-source
// SourceUniforms). The colorFragment module additionally declares
// '@group(1)' (FadeUniforms). GalaxyPickRenderer binds a no-op fade buffer
// at '@group(1)' so its pipeline layout matches the visual pipeline.

import package::galaxyCatalog::points::io::Uniforms;
import package::galaxyCatalog::points::io::PerVertex;
import package::galaxyCatalog::points::io::VSOut;
import package::galaxyCatalog::points::vertexBody::galaxyPointVertex;
import package::lib::sourceUniforms::SourceUniforms;
import package::lib::focusUniforms::FocusUniforms;

// ── @group(0) — per-frame uniforms ──────────────────────────────────
//
// Same binding numbers as colorFragment.wesl. Both renderers' uniform
// buffers carry the layout described in 'points/io.wesl::Uniforms';
// the visual pass writes the full struct each frame, and the pick pass
// re-uses the same buffer (with a small in-place mutation to boost the
// pick floor — see galaxyPickRenderer.ts).
@group(0) @binding(0) var<uniform> u: Uniforms;

// ── @group(1) — FadeUniforms (declared but unused at vertex stage) ─
//
// We don't re-declare FadeUniforms here because the vertex stage
// never reads it — only the fragment stage multiplies fade.opacity
// into alpha. The pipeline layout's @group(1) slot is still present
// (the fragment module declares it), so the bind group built by the
// renderer is valid; the vertex module simply doesn't reference the
// binding.

// ── @group(2) — per-source SourceUniforms ──────────────────────────
//
// Each loaded galaxy catalog has its OWN @group(2) bind group whose buffer
// carries SourceUniforms's 16-byte struct (sourceCode + sbBoost
// + falloffHalfMpc + 4 bytes pad — see lib/sourceUniforms.wesl).
// Per-source bind groups dodge the 'queue.writeBuffer' race entirely
// (different uniform buffers per source means writes to one don't
// race against draws against another). The vertex stage reads
// 'source.sourceCode' to compose '(sourceCode << 26u) | instance_index'
// for the pick-output path.
@group(2) @binding(0) var<uniform> source: SourceUniforms;

// ── @group(3) — structure-focus uniform (single shared binding) ───────
//
// One POI is focused at a time, so this is a single global binding (not
// per-source like fade). 'focusAlphaMultiplier' folds a membership-based
// dim into 'intensity'; at blend == 0 it returns 1.0 (no-op when nothing
// is focused). See lib/focusUniforms.wesl for the math.
@group(3) @binding(0) var<uniform> focus: FocusUniforms;

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
  p: PerVertex,
) -> VSOut {
  return galaxyPointVertex(vi, ii, p, u, source, focus);
}
