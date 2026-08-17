// starAggregateUpsample/io.wesl — the vertex/fragment contract for the
// survey-star aggregate upsample composite. Identical shape to
// additiveUpsample/io: a fullscreen covering triangle carrying the [0,1] uv the
// fragment samples the half-res 'star-aggregates' offscreen at.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
