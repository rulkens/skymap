// antiqueLook/passes/landBlurFragment.wesl — `wash.a`'s land share blurred by a Gaussian of
// LAND_SIGMA print units, separably at quarter res: `fsAcross` reads `wash`,
// `fsDown` reads its output. Sky and unmapped cells carry no weight
// (`landWeight`), so a coast near the limb keeps its share. Out: x Σ weight·share, y Σ weight; the plate
// divides, then inverts the blur to a distance off the coast (`seaDistance`).

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::io::VSOut;
import package::antiqueLook::shared::engraving::LAND_SIGMA;
import package::antiqueLook::shared::engraving::landWeight;

@group(0) @binding(0) var inTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> uniforms: AntiqueUniforms;

// Device px per quarter-res cell: ANTIQUE_CELL (data/rendering/antiqueLook.ts).
const CELL: f32 = 4.0;

fn blur(cellPos: vec2<i32>, axis: vec2<i32>, fromWash: bool) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(inTex));
  let sigma = LAND_SIGMA * uniforms.unit / CELL;
  let reach = i32(ceil(3.0 * sigma));
  var sum = vec2<f32>(0.0);
  for (var offset = -reach; offset <= reach; offset++) {
    let tapTexel = textureLoad(inTex, clamp(cellPos + axis * offset, vec2<i32>(0), size - 1), 0);
    let tap = select(tapTexel.xy, vec2<f32>(tapTexel.a, 1.0) * landWeight(tapTexel.a), fromWash);
    sum += tap * exp(-0.5 * f32(offset * offset) / (sigma * sigma));
  }
  return vec4<f32>(sum, 0.0, 1.0);
}

@fragment
fn fsAcross(in: VSOut) -> @location(0) vec4<f32> {
  return blur(vec2<i32>(in.pos.xy), vec2<i32>(1, 0), true);
}

@fragment
fn fsDown(in: VSOut) -> @location(0) vec4<f32> {
  return blur(vec2<i32>(in.pos.xy), vec2<i32>(0, 1), false);
}
