// lib/sceneDepth.wesl — how much of an overlay drawn AFTER the solar-system
// bodies survives the foreground in front of it, for an overlay spanning
// several 'foreground:0' rows (each clears its OWN depth, so the depth buffer
// only ever holds the LAST row's value). A step that instead declares
// 'depth: { sample: <row> }' reads that row's depth directly — see
// 'atmosphere/aerialPerspective/fragment.wesl' and the contact-shadow decal.
//
// A factor, never a threshold: this alpha is the weight the 'foreground:0 →
// hdr' OVER composite already multiplies the foreground by, so any cutoff
// over it gives one number two meanings.

import package::lib::math::saturate;
import package::lib::sceneDepthRay::FAR_DEPTH;
import package::lib::sceneDepthRay::sceneRayDistance;

// The km-scaled frame of the row that stamped 'sceneDepthTex', plus the
// viewport the fragment divides its own pixel by —
// 'renderers/labels/occlusionCoverageGroup.ts' mirrors these byte offsets.
struct SampledDepthFrame {
  invMvp: mat4x4<f32>,
  camPosKm: vec3<f32>,
  viewportPx: vec2<f32>,
};

@group(1) @binding(0) var sceneColorTex: texture_2d<f32>;
@group(1) @binding(1) var sceneDepthTex: texture_depth_2d;
@group(1) @binding(2) var<uniform> depthFrame: SampledDepthFrame;

/**
 * Fraction of an overlay fragment that survives here: 0 under an opaque body,
 * 1 where the foreground drew nothing. Callers scale their PREMULTIPLIED output
 * by it; 'saturate' guards the loud failure mode, since an a > 1 producer would
 * give a negative factor, which BRIGHTENS an overlay under premultiplied OVER.
 * 'fragXY' ('@builtin(position).xy') indexes the texel 1:1 because
 * 'foreground:0' and 'swap' both render at scale 1.
 */
fn sceneTransmittance(fragXY: vec2f) -> f32 {
  return saturate(1.0 - textureLoad(sceneColorTex, vec2i(fragXY), 0).a);
}

/**
 * 1 where the sampled scene stands nearer than 'nearKm', else 0 — the second
 * occluder channel, covering the terrain and meshes of the ONE row that last
 * cleared this depth, which the analytic body spheres under-report by the
 * whole relief. Callers take 'max' with their own sphere verdict and mix
 * 'sceneTransmittance' in by the result.
 *
 * 'nearKm' is the subject's NEAR surface (centre minus radius), so a body
 * never occludes its own caption, and an eye inside the subject makes it
 * negative, which this never satisfies. The depth texture need not match the
 * viewport (the far placeholder is 1x1), so the texel is rescaled while the
 * ray keeps the fragment's own uv.
 *
 * Called from the vertex stage, once per subject at that subject's own window
 * position — not per rendered text/line pixel, which can sit tens of km of
 * relief away.
 */
fn sceneDepthOccludes(fragXY: vec2f, nearKm: f32) -> f32 {
  let texel = vec2i(fragXY * vec2f(textureDimensions(sceneDepthTex)) / depthFrame.viewportPx);
  let depth = textureLoad(sceneDepthTex, texel, 0);
  if (depth == FAR_DEPTH) {
    return 0.0;
  }
  let sceneKm = sceneRayDistance(
    fragXY / depthFrame.viewportPx,
    depth,
    depthFrame.invMvp,
    depthFrame.camPosKm,
  );
  return select(0.0, 1.0, sceneKm < nearKm);
}
