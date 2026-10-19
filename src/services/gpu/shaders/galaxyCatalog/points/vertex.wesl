// points/vertex.wesl — the flat points pipeline's vertex entry point: the
// bindings and vertex-buffer attributes, handed to 'galaxyPointVertex'
// (points/vertexBody.wesl).
//
// Both renderers compile this (visual with 'colorFragment.wesl', pick with
// 'pickFragment.wesl'), each into its OWN GPUShaderModule: an 'auto'
// bind-group layout is pipeline-local, so a module is never shared.
//
// Bindings are declared here, not in io.wesl: WESL cannot export a module-local
// '@group/@binding' var. Importing the one 'Uniforms' struct keeps the layout
// identical across modules. The pick pass binds a no-op FadeUniforms buffer at
// '@group(1)' so its layout matches the visual pipeline.

import package::galaxyCatalog::points::io::Uniforms;
import package::galaxyCatalog::points::io::PerVertex;
import package::galaxyCatalog::points::io::VSOut;
import package::galaxyCatalog::points::vertexBody::galaxyPointVertex;
import package::lib::sourceUniforms::SourceUniforms;
import package::lib::focusUniforms::FocusUniforms;

@group(0) @binding(0) var<uniform> u: Uniforms;

// '@group(1)' FadeUniforms is fragment-only; the vertex module never references it.

// Per-source bind groups (own buffer each) dodge the 'queue.writeBuffer' race.
// 'source.sourceCode' composes '(sourceCode << 26u) | instance_index' for pick.
@group(2) @binding(0) var<uniform> source: SourceUniforms;

// Single shared binding: one POI is focused at a time.
@group(3) @binding(0) var<uniform> focus: FocusUniforms;

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
  p: PerVertex,
) -> VSOut {
  return galaxyPointVertex(vi, ii, p, u, source, focus);
}
