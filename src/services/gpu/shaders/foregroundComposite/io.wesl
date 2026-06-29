// foregroundComposite/io.wesl — shared vertex-to-fragment interface for
// the foreground OVER-composite pass.
//
// Mirrors 'volumeUpsample/io.wesl' exactly — the pass shape is identical
// (covering-triangle vertex stage emitting a UV, fragment stage sampling
// one texture); only the blend state and the fragment output differ.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
}
