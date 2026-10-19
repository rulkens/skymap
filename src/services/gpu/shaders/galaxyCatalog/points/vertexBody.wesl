// points/vertexBody.wesl — the galaxy point vertex stage as one function,
// called by each prologue ('vertex.wesl' hands it the vertex-buffer attributes
// and its module's bindings).
//
// Uniform structs travel by value (precedent: 'focusAlphaMultiplier'). 'p' is
// a constructed value: a prologue reading storage builds it field by field,
// never by passing a storage struct by value (the Adreno landmine in
// docs/RENDERER.md). 'pickIndex' is packed beside the source code for picking.

import package::galaxyCatalog::points::io::Uniforms;
import package::galaxyCatalog::points::io::PerVertex;
import package::galaxyCatalog::points::io::VSOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::triCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::sourceUniforms::SourceUniforms;
import package::lib::selectionEncoding::packSelection;
import package::lib::focusUniforms::FocusUniforms;
import package::lib::focusUniforms::focusAlphaMultiplier;
import package::lib::focusUniforms::FOCUS_PICK_EXCLUDE_BELOW;

fn galaxyPointVertex(
  vi: u32,
  pickIndex: u32,
  p: PerVertex,
  u: Uniforms,
  source: SourceUniforms,
  focus: FocusUniforms,
) -> VSOut {
  let center = worldToClip(u.cam, p.position);
  let corner = triCorner(vi);
  let myPacked = packSelection(source.sourceCode, pickIndex);

  // The estimated-not-measured bit rides each attribute's sign. A row with the
  // format's NaN "no measurement" sentinel reads as MEASURED ('NaN < 0.0' is
  // false): nothing to audit in the highlight, but an 'estimated'-only filter
  // culls it too.
  let orientEstimated = p.axisRatio < 0.0;
  let sizeEstimated = p.radiusMpc < 0.0;

  // Gated rows emit a clip position outside the NDC cube so the rasteriser
  // drops the primitive: no fragment work and no pick write, so a culled
  // galaxy is not clickable. Filter codes (points/io.wesl): 0 all, 1 only
  // measured, 2 only estimated; the two axes AND together.
  let malmquistGated = u.biasMode == 1u && p.absMag > u.absMagLimit;
  let orientGated = (u.orientationFilter == 1u && orientEstimated)
    || (u.orientationFilter == 2u && !orientEstimated);
  let sizeGated = (u.sizeFilter == 1u && sizeEstimated)
    || (u.sizeFilter == 2u && !sizeEstimated);
  if (malmquistGated || orientGated || sizeGated) {
    var earlyOut: VSOut;
    earlyOut.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    earlyOut.uv = corner;
    earlyOut.instanceTint = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    earlyOut.instanceIdx = myPacked;
    earlyOut.ellipse = vec3<f32>(1.0, 0.0, 1.0);
    return earlyOut;
  }

  let toGalaxy = p.position - u.camPosWorld;
  let distanceMpc = length(toGalaxy);
  let safeDist = max(distanceMpc, 0.001);
  // abs(): radiusMpc's sign bit is the fallback-diameter flag.
  let radiusMag = abs(p.radiusMpc);
  let apparentPxRadius = (radiusMag / safeDist) * u.pxPerRad;
  // Resolved disks are picked by the procedural-disk pass, so the point pick
  // only claims the dot floor.
  let inPickPass = u.pickPass == 1u;
  let sizePx = select(max(u.pointSizePx, apparentPxRadius), u.pointSizePx, inPickPass);

  let offset = expandBillboardScreen(u.cam, center, sizePx, corner);

  var out: VSOut;
  out.clip = center + vec4<f32>(offset, 0.0, 0.0);
  out.uv = corner;

  //   intensity = min(sbAmp, galaxySbMax) x galaxySbScale x sbBoost x fluxFalloff
  //               x brightness x angularWeight (mode 2 only) x crossfadeOut x focusMult
  let angularMult = select(1.0, p.angularWeight, u.biasMode == 2u);

  // Complement of the procedural-disk pass's fade-in over [pxFadeStart,
  // pxFadeEnd], so the additive contribution stays constant through the band.
  let apparentDiameterPx = sizePx * 0.5;
  let crossfadeOut = select(
    1.0 - smoothstep(u.pxFadeStart, u.pxFadeEnd, apparentDiameterPx),
    1.0,
    inPickPass,
  );

  // Exactly 1.0 for members and at rest, below 1.0 only for a non-member under
  // an active focus: the pick exclusion below keys on that. Folded into
  // intensity so a faded non-member under the floor is culled, not piled up.
  let focusMult = focusAlphaMultiplier(p.position, focus);
  let sbAmpClamped = min(p.sbAmp, u.galaxySbMax);
  // pow(resolvedFrac, k): k = 2 is the full inverse-square, lower k keeps the
  // deep field visible; depth-fade OFF holds flat surface brightness.
  let resolvedFrac = clamp(apparentPxRadius / u.pointSizePx, 0.0, 1.0);
  let fluxFalloff = select(1.0, pow(resolvedFrac, u.galaxyFalloffStrength), u.depthFadeEnabled == 1u);
  let intensity = sbAmpClamped * u.galaxySbScale
    * source.sbBoost
    * fluxFalloff
    * u.brightness
    * angularMult
    * crossfadeOut
    * focusMult;

  // instanceTint: .rgb is the brightness modulator and .w the colour index; the
  // ramp is sampled per fragment ('rampRadial' in colorFragment.wesl) because
  // its argument depends on the fragment's radius. A provenance highlight
  // REPLACES the colour (a tint darkens an already-red galaxy) with a flat
  // colour no real SED produces. The sign of .w selects the path:
  // 'pickColourIndex' clamps to [0, 2], so negative is free as the "highlight,
  // .rgb is final" flag, saving an interpolator slot on a blend-bound pass.
  let orientHighlight = u.orientationHighlight == 1u && orientEstimated;
  let sizeHighlight = u.sizeHighlight == 1u && sizeEstimated;

  let HIGHLIGHT_BOOST = 2.5;
  var highlightRgb = vec3<f32>(0.0);
  var highlightActive = false;
  if (orientHighlight && sizeHighlight) {
    highlightRgb = vec3<f32>(1.0, 0.85, 0.1);
    highlightActive = true;
  } else if (orientHighlight) {
    highlightRgb = vec3<f32>(1.0, 0.1, 0.9);
    highlightActive = true;
  } else if (sizeHighlight) {
    highlightRgb = vec3<f32>(0.15, 1.0, 0.25);
    highlightActive = true;
  }

  // Circle for invalid axis ratios: 'abs(NaN) > 0.0' is false.
  let absAR = abs(p.axisRatio);
  let safeAB = select(1.0, max(absAR, 0.05), absAR > 0.0);

  let tintRgb = select(vec3<f32>(intensity), highlightRgb * intensity * HIGHLIGHT_BOOST, highlightActive);
  let tintW = select(p.colorIndex, -1.0, highlightActive);
  out.instanceTint = vec4<f32>(tintRgb, tintW);

  // The pick pass skips the cull so dimmed galaxies stay clickable.
  let INVISIBILITY_THRESHOLD = 0.005;
  if (intensity < INVISIBILITY_THRESHOLD && !inPickPass) {
    out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
  }

  // Non-members of a focused structure are not hit-testable.
  if (inPickPass && focusMult < FOCUS_PICK_EXCLUDE_BELOW) {
    out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
  }

  out.instanceIdx = myPacked;
  out.ellipse = vec3<f32>(p.paCosSin, safeAB);

  return out;
}
