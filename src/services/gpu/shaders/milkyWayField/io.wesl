// milkyWayField/io.wesl — layout for the ANALYTIC Milky Way field: a
// Gaussian mixture whose line integral is evaluated per fragment, one
// instanced quad per component, as the closed-form alternative to sampling
// the same density with sprites.
//
// Its own struct, deliberately NOT milkyWayCloud's: nothing here is a
// billboard, so viewProj, the billboard basis and the px clamps are all
// dead weight, while the per-fragment RAY this pass needs has no home in
// that layout at all.
//
// ## Byte layout (canonical — the offset authority for the CPU packer)
//
// HEADER (uniform, binding 0) — camera + params only, unchanged every frame
// in shape though its bytes are rewritten every frame (the fade/exposure
// terms in 'params' track the camera):
//
//   offset 0   : eye: vec4      (xyz camera world position, w unused)
//   offset 16  : camRight: vec4 (world-space camera basis, w unused)
//   offset 32  : camUp: vec4
//   offset 48  : camFwd: vec4
//   offset 64  : params: vec4   (tanHalfFov, aspect, lensShiftX, exposure)
//   offset 80  : counts: vec4   (emissionCount, dustOffset, dustCount, primaryCount)
//   offset 96  : counts2: vec4  (featCount, dustMapHeightPx, fieldWidthPx, fieldHeightPx)
//   offset 112 : dustExtinction: vec4 (A_lambda/A_V per channel, w unused)
//   offset 128 : dustNoise: vec4 (tileUnits, amplitude, cloudOffset, contrastExp)
//   offset 144 : dustSlices: vec4 (t1, t2, t3, unused)
//   total: 160 bytes.
//
// counts.x is the live EMISSION component count — the central galaxy's plus
// every extra's, drawn one quad each (see splat.wesl). counts.y/.z locate
// the dust slice that follows them: dustOffset == emissionCount (dust is
// always appended AFTER every emission component), dustCount its length.
// Dust components are NEVER drawn as quads — the draw call's instance count
// is counts.x, not counts.x + counts.z — each primary emission fragment
// instead walks the dust slice itself (splat.wesl's fs). counts.w is
// primaryCount, the CENTRAL galaxy's own emission share of counts.x (its
// components are packed first): the gate 'instanceIndex < primaryCount'
// is what keeps an extra's emission from ever reading the primary's dust.
//
// counts2.x is featCount, the detail-tier dust FEATURE draw's own instance
// count (dustFeature.wesl) — a second population living in its own 'feats'
// storage array (binding 3), not appended to 'comps': a feature's four-vec4
// record shape (p0/p1/normal/etc, see below) has nothing in common with a
// Gaussian's inverse-covariance layout, so packing them into one array would
// mean one of the two readers interpreting the other's bytes as its own
// shape. counts2.y is dustMapHeightPx, dustMapTex's own pixel height
// (createGalaxyEngine.ts's buildDustMapTarget sizes it to
// reducedSize(render.dustDivisor) — see the DUST MAP entry below; dustMapTex
// no longer shares fieldTex's extent) — UNREAD by dustFeature.wesl (its
// sub-pixel width clamp uses fwidth() instead) but read by dustMap.wesl's
// dust-noise multiplier below, to band-limit the baked volume's four octaves
// against the fragment's own world-space pixel footprint — the octave
// band-limiting this lane was reserved for. counts2.zw is fieldSizePx
// (fieldWidthPx, fieldHeightPx), fieldTex's own pixel size
// (reducedSize(render.fieldDivisor)) — splat.wesl's fs is the one reader: it
// runs at the FIELD's resolution but samples dustMapTex at the DUST map's own
// (now different, usually finer) resolution, so it needs its own target's
// extent to turn 'input.pos.xy' into a normalized UV instead of a direct
// texel index — see the DUST MAP entry below.
//
// dustNoise (offset 128) erodes the PARTICLE-CLOUD tier of the primary's
// dust slice only (dustMap.wesl's fs) — never the smooth 4-component disc
// mixture, whose components are kiloparsecs across, so one noise sample at
// a component's closest-approach point would modulate an entire diffuse
// column by a single value and read as a giant blotch, not erosion.
// tileUnits (.x) is the world span of one full wrap of dustNoiseBake.wesl's
// baked volume; amplitude (.y) is the erosion strength — 0 disables it, and
// the shader branches out entirely rather than sampling for a no-op 1.0;
// cloudOffset (.z) is the index WITHIN the dust slice (relative to
// dustOffset, matching dustMap.wesl's own 'input.inst') where the particle
// cloud starts — the smooth lane mixture's own length, captured where
// createGalaxyEngine.ts's rebuildDustMixture concatenates the two. The
// multiplier rides THIS accumulation pass rather than a consumer
// (splat.wesl, dustPresent.wesl): both read the eroded column from here
// with no second code path. contrastExp (.w) is dustMap.wesl's signed power
// exponent shaping the noise about its own midpoint — 1/textureContrast,
// inverted CPU-side (createGalaxyEngine.ts's rebuildDustMixture) so a HIGHER
// contrast slider value maps to a SMALLER exponent (harder filament edges)
// with the shader itself doing one plain pow().
//
// dustSlices (offset 144) is the VIEW-DEPENDENT depth partition the dust map
// accumulates into instead of one whole-ray column — a single mean depth put
// a hard 50% floor on obscuration (everything nearer than the mean read as
// unobscured no matter how much dust existed), because the dust's own tau
// centroid sits INSIDE the emitting material both for an edge-on lane over
// the disc and for the view from inside it. Four slices [0,t1), [t1,t2),
// [t2,t3), [t3,inf) fix that by attenuating each slice's own emission by only
// the tau in front of IT, so opacity can go to 100% as tau does.
// createGalaxyEngine.ts's drawFrame computes t1..t3 once per frame from
// D = distance(eye, origin) and R = the dust's own reach (3x its widest
// component's sigmaR, cached by rebuildDustMixture): tNear = max(D-R,
// 0.02*R), tFar = D+R, t_k = tNear*(tFar/tNear)^(k/4). Geometric, not linear,
// spacing: from OUTSIDE the galaxy D-R is large and the [tNear,tFar] band is
// thin, where geometric spacing degenerates to linear across exactly the
// span the dust occupies; from INSIDE, D-R goes negative, the 0.02*R floor
// engages, and the spacing turns logarithmic — right for a view where dust
// in the observer's own arm matters as much as dust 8 kpc away. Packed once
// here so dustMap.wesl (which writes the slices), dustFeature.wesl (which
// writes into whichever one slice its plane-crossing depth falls in) and
// splat.wesl (which reads all four back) agree on the same edges.
//
// COMPS (read-only storage, binding 1) — every mixture's components back to
// back (the central galaxy's emission, then each background extra's,
// already carried into world space — see transformGalaxyFieldComponent.ts —
// then the central galaxy's dust slice last), four vec4 each. A storage
// array has no fixed capacity the way a uniform array does, which is the
// whole reason this lives in its own binding: a uniform's 64 KiB caps it
// near 1000 components (~3 galaxies' worth), and N extras must be able to
// outgrow that. The CPU packer sizes the backing GPUBuffer to counts.x +
// counts.z (growing, never per-frame).
//
// The ray comes from a camera BASIS plus tanHalfFov/aspect rather than an
// inverse view-projection: the engine already holds the basis (it packs the
// same rows for the sprite billboards) and the fov, so this needs no matrix
// inverse and no depth-convention bookkeeping. lensShiftX undoes the
// off-centre framing the engine writes into proj[8]; without it the
// analytic field slides against the sprites whenever a side panel is open.
//
// Per component, four vec4 carry the WORLD-space inverse covariance M of
// exp(-0.5*(p-center)^T*M*(p-center)), plus amplitude, colour and a centre:
//   [4i]   = (m00, m11, m22, amplitude)
//   [4i+1] = (m01, m02, m12, boundRadius)
//   [4i+2] = (colorR, colorG, colorB, unused)
//   [4i+3] = (cx, cy, cz, unused)
// Six independent M entries, not three sigmas and a tilt: a component's own
// warp shear (buildGalaxyFieldMixture, linearised about its centre) tilts it
// out of any axis-aligned frame. Index 1 of M is the DISC POLE (+Y).
// boundRadius (world-space max sigma, warp-inflated — see
// GalaxyFieldComponent) sizes splat.wesl's per-instance quad.
//
// Dust components (past dustOffset) reuse this exact 4-vec4 record with two
// re-readings, not two new lanes: [4i].w (amplitude for emission) is the
// component's central V-band extinction density, per unit length; [4i+2].xyz
// (color for emission) is the per-channel A_lambda/A_V extinction ratio
// (galaxyDustMixture.ts's dustExtinctionRgb), not a tint — carried per
// component for a future per-extra dust loop, but NOT what the primary
// galaxy's attenuation actually reads: dustMap.wesl sums every dust
// component down to four depth-sliced tau columns before splat.wesl ever
// sees it, so the per-component colour lane has nowhere left to apply for the
// primary. The law splat.wesl uses instead arrives per-frame, in this
// header's own dustExtinction lane below. [4i+1].w (boundRadius) and
// [4i+3].xyz (center) mean the same thing they do for an emission
// component. Dust components are consumed by dustMap.wesl's own splat pass
// now, not looped over inside splat.wesl's fs — see binding 2.
//
// DUST MAP (binding 2) — the screen-space depth-sliced optical-depth
// accumulation dustMap.wesl and dustFeature.wesl both splat the PRIMARY
// galaxy's dust into, additively: (tau_0, tau_1, tau_2, tau_3), one channel
// per dustSlices bin above, replacing splat.wesl's former per-fragment dust
// loop (see splat.wesl's header and the grill-session doc's N1). Purely
// additive and order-independent like the single-column map it replaced —
// each channel is still just an optical-depth sum, only partitioned by depth
// now instead of collapsed to one mean. Sized to
// reducedSize(render.dustDivisor) — its OWN divisor
// (createGalaxyEngine.ts's buildDustMapTarget), independent of fieldTex's:
// the dust splat (particle cloud + lane/spur/bubble/bead network) is far
// higher-frequency than the smooth emission field, and sharing fieldTex's
// coarser target decimated thin lanes into beads — the bug that motivated
// giving it a divisor of its own.
//
// dustPresent.wesl (the JWST view) renders into its OWN target, dustViewTex,
// ALSO sized to reducedSize(render.dustDivisor) (createGalaxyEngine.ts's
// buildDustViewTarget) — so its 1:1 framebuffer-coord texel load stays valid
// despite the two maps no longer sharing fieldTex's extent. A resolution
// mismatch there is still invisible in types: it silently decimates any lane
// thinner than the mismatch into beads, or misregisters the whole map toward
// one corner.
//
// splat.wesl runs at fieldTex's (coarser) resolution instead, so its 1:1
// texel load no longer applies — it reads this map through 'dustMapSmp'
// (binding 6), a normalized-UV, linearly filtered sample built from
// counts2.zw (fieldSizePx) above. Bilinear is not a correct box downsample
// of a finer source, so fine dust structure can shimmer under camera
// motion; a mip chain sampled at the resolution ratio's LOD would fix that
// and is a deliberate, not-yet-done follow-up. Only bound by the emission
// splat pipeline (splat.wesl imports it, along with dustMapSmp); the two
// splat passes that WRITE it never read it.
//
// FEATS (read-only storage, binding 3) — the detail-tier dust splat network
// (dustFeature.wesl), one record per feature, five vec4 each. 'kind' (last
// lane of [5i+3]) selects which of the two shapes below the rest of the
// record means:
//   [5i]   = (p0.x, p0.y, p0.z, width)
//   [5i+1] = (p1.x, p1.y, p1.z, amplitude)
//   [5i+2] = (normal.x, normal.y, normal.z, edgeSharpness)
//   [5i+3] = (noiseSeed, noiseAmp, noiseFreq, kind)
//   [5i+4] = (sOffset, taperIn, taperOut, unused)
//
// kind 0 (lane/spur segment, dustNetworkFeatures.ts): p0/p1 are the
// segment's world-space endpoints (offset to the arm's inner edge for
// lanes, a free-standing chain for spurs), 'normal' the local disc-plane
// normal the fragment shader intersects its view ray against. width is the
// across-lane super-Gaussian sigma; amplitude its peak tau. sOffset is this
// segment's start arc-length along its whole chain (noiseFreq's argument
// adds it in, so the noise pattern stays phase-continuous across a joint
// instead of restarting). taperIn/taperOut are world-space taper lengths at
// this segment's own two ends; 0 butts seamlessly against a neighbour —
// only a chain's two free ends taper, never an interior joint (per-segment
// tapering at every joint is what produced a beaded-dash look instead of a
// continuous ridge).
//
// kind 1 (bubble disc) / kind 2 (bead disc): p0 is the disc CENTRE, width is
// its RADIUS R, p1 is UNUSED (set to p0 plus a unit offset so the shader's
// unguarded fragment-side segment-length division never sees zero), normal
// the local disc-plane normal as for a lane. noiseAmp is REPURPOSED as
// rimGain (kind 1 only, 0..1 — GalaxyDustNetworkParams.bubbleRimStrength);
// noiseSeed/noiseFreq/sOffset/taperIn/taperOut/edgeSharpness are unused for
// both disc kinds (dustFeature.wesl hardcodes their hole/rim/bead exponents).
//
// Grown like 'comps', never shrunk.

struct FieldUniforms {
  eye: vec4<f32>,
  camRight: vec4<f32>,
  camUp: vec4<f32>,
  camFwd: vec4<f32>,
  params: vec4<f32>,
  counts: vec4<f32>,
  counts2: vec4<f32>,
  dustExtinction: vec4<f32>,
  dustNoise: vec4<f32>,
  dustSlices: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: FieldUniforms;
@group(0) @binding(1) var<storage, read> comps: array<vec4<f32>>;
@group(0) @binding(2) var dustMapTex: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> feats: array<vec4<f32>>;
// Bindings 4/5: the baked ridged-noise volume (dustNoiseBake.wesl) — ONLY
// dustMap.wesl imports these two. Every pipeline here uses 'layout: auto'
// (createGalaxyEngine.ts), which derives a bind-group layout from the
// bindings the SHADER actually references, so dustFeature.wesl (importing
// only 'u'/'feats') never gains entries 4/5, and splat.wesl (importing
// 'u'/'comps'/'dustMapTex') never gains them either — each pipeline's bind
// group stays exactly the bindings its own shader references, unaffected by
// this file growing.
@group(0) @binding(4) var dustNoiseTex: texture_3d<f32>;
@group(0) @binding(5) var dustNoiseSmp: sampler;
// Binding 6: dustMapTex's own sampler — ONLY splat.wesl imports it (see the
// DUST MAP entry above for why its fs needs a filtered UV sample where
// dustMap.wesl/dustFeature.wesl write-only and dustPresent.wesl's still-1:1
// read of its own divisor-matched target do not). rgba16float is filterable
// in WebGPU core, so a plain 'filtering' sampler suffices — no comparison,
// no manual mip selection.
@group(0) @binding(6) var dustMapSmp: sampler;
