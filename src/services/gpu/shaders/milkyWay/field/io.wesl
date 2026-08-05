// milkyWay/field/io.wesl — layout for the ANALYTIC Milky Way field: a
// Gaussian mixture whose line integral is evaluated per fragment, one
// instanced quad per component, as the closed-form alternative to sampling
// the same density with sprites.
//
// Its own struct, deliberately NOT the sprite tier's: nothing here is a
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
//   offset 96  : counts2: vec4  (unused, dustMapHeightPx, fieldWidthPx, fieldHeightPx)
//   offset 112 : dustExtinction: vec4 (A_lambda/A_V per channel, w unused)
//   offset 128 : dustNoise: vec4 (tileUnits, amplitude, cloudOffset, contrastExp)
//   offset 144 : dustSlices: vec4 (t1, t2, t3, unused)
//   offset 160 : debugView: vec4 (dustViewIntensity, sfMapViewIntensity, orientationViewIntensity, galaxyWeight)
//   offset 176 : sfMapChannels: vec4 (gasWeight, recentSfWeight, activityWeight, dustWeight)
//   offset 192 : bubbleView: vec4 (intensity, unused, unused, unused)
//   offset 208 : dustDetail: vec4 (strength, hiiTextureScale, hiiTextureContrast, sweptMix)
//   total: 224 bytes.
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
// counts2.x is unused; it stays a lane rather than shrinking the header so
// the offsets below it (and packFieldUniforms.ts's FIELD_HEADER_FLOATS) do
// not move. counts2.y is dustMapHeightPx, dustMapTex's own pixel height
// (createGalaxyRenderTargets.ts's rebuildDust sizes it to
// reducedSize(render.dustDivisor) — see the DUST MAP entry below; dustMapTex
// no longer shares fieldTex's extent) — read by dustMap.wesl's dust-noise
// multiplier below, to band-limit the baked volume's four octaves against
// the fragment's own world-space pixel footprint. counts2.zw is fieldSizePx
// (fieldWidthPx, fieldHeightPx), fieldTex's own pixel size
// (reducedSize(render.fieldDivisor)) — splat.wesl's fs is the one reader: it
// runs at the FIELD's resolution but samples dustMapTex at the DUST map's own
// (now different, usually finer) resolution, so it needs its own target's
// extent to turn 'input.pos.xy' into a normalized UV instead of a direct
// texel index — see the DUST MAP entry below.
//
// dustNoise (offset 128) erodes the primary's whole dust slice
// (dustMap.wesl's fs) — the particle cloud is the ONLY dust tier now (the
// smooth analytic disc mixture this loop used to skip past was deleted; see
// galaxyDustMixture.ts's header on the CPU side), so there is no longer a
// kiloparsec-scale component whose single noise sample would read as a
// giant blotch rather than erosion.
// tileUnits (.x) is the world span of one full wrap of dustNoiseBake.wesl's
// baked volume; amplitude (.y) is the erosion strength — 0 disables it, and
// the shader branches out entirely rather than sampling for a no-op 1.0;
// cloudOffset (.z) is the index WITHIN the dust slice (relative to
// dustOffset, matching dustMap.wesl's own 'input.inst') where the particle
// cloud starts — always 0 now that it's the only tier, kept as a live field
// rather than deleted since the byte layout below still reserves it. The
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
// here so dustMap.wesl (which writes the slices) and splat.wesl (which reads
// all four back) agree on the same edges.
//
// debugView (offset 160) carries the three debug-view crossfade sliders
// (createGalaxyEngine.ts's render.dustViewIntensity/sfMapViewIntensity/
// orientationViewIntensity, each in [0,1]) plus galaxyWeight, the ONE
// combined dimming factor for the galaxy's own emission — 1 minus the
// largest of the three, floored at 0, so two views live at once never
// double-dim the galaxy. splat.wesl's fs multiplies its final colour by
// .w; dustPresent.wesl/sfMapPresent.wesl/orientationPresent.wesl each
// multiply by their own lane (.x/.y/.z) instead of gating a whole pass on
// a boolean, which is what makes the three crossfade independently rather
// than replace one another.
//
// sfMapChannels (offset 176) is sfMapPresent.wesl's own per-channel
// isolation control, orthogonal to debugView.y (the whole view's crossfade
// weight): the palette there sums gas+old+recent+dust, and with all four
// always visible there was no way to tell which one you were looking at. .w
// (dustWeight) scales the packed texel's own .w lane — the conserved dust
// channel, unclamped since 9aa9fe5d (rims legitimately overshoot to 8). Each
// weight independently scales its channel before the palette multiply, so
// zeroing three isolates the fourth.
//
// bubbleView (offset 192) is bubblePresent.wesl's own crossfade weight —
// the SF-event catalog's (dustBubblePlacements.ts) bubble/cavity overlay, a
// SECOND, independent star-formation model drawn alongside sfMap's own view
// so the two can be compared directly. Not folded into debugView: that vec4
// is full (dust/sfMap/orientation/galaxyWeight), and reusing
// sfMapChannels.w would name a bubble weight after an unrelated automaton
// channel. Only .x is live; .yzw are reserved the same way counts2.x is.
//
// dustDetail (offset 208) is S4's high-pass strength: dustMap.wesl's fs
// (dustDetail.wesl) multiplies each dust splat's own slices by the SF map's
// detail ratio (map density over an 8-texel-blurred copy, sfMapDustBlur.wesl)
// at that splat's closest-approach point — applied once, at ACCUMULATION, so
// it parallaxes with the splats instead of stamping one flat pattern across
// the whole depth column. Both consumers (splat.wesl, dustPresent.wesl) see
// it through the column with no second read; 0 disables it. The
// accumulation multiply scales its deviation by a mean-1 sample of the baked
// noise volume so the 2D map's contrast doesn't extrude into vertical
// curtains (dustMap.wesl).
//
// .yz are unrelated to S4 — they ride this vec4's two free lanes only
// because they were free, not because they are "dust detail": hiiTextureScale/
// hiiTextureContrast are the HII tier's own tier-global noise-modulation knobs
// (GalaxyHiiTuning.textureScale/textureContrast), read by splat.wesl's
// hiiNoiseTerm for EVERY HII draw's fragments regardless of which group
// (shell/DIG/associations) a component belongs to — only each component's own
// comps[4i+2].w (textureWeight) varies per group. hiiTextureScale 0 is what
// lets the shader skip the noise sample entirely via a uniform branch — the
// primary field pass packs 0 here always, since its own components never
// carry a nonzero textureWeight, so the far larger disc/arms fragment count
// never pays for a sample it would just multiply by zero. .w (sweptMix) is
// dustDetail.wesl's own free lane, the last one in this vec4 — 0 (default)
// reads the legacy gas x oldActivity product, 1 the conserved swept-dust
// channel (GalaxyDustTuning.sweptMix); sfMapDustBlur.wesl blends its own
// low-pass by the same value, through its own tiny uniform, not this header.
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
//   [4i+2] = (colorR, colorG, colorB, textureWeight)
//   [4i+3] = (cx, cy, cz, unused)
// Six independent M entries, not three sigmas and a tilt: a component's own
// warp shear (buildGalaxyFieldMixture, linearised about its centre) tilts it
// out of any axis-aligned frame. Index 1 of M is the DISC POLE (+Y).
// boundRadius (world-space max sigma, warp-inflated — see
// GalaxyFieldComponent) sizes splat.wesl's per-instance quad. textureWeight
// (GalaxyFieldComponent's own field) is 0 (untouched) for every producer
// except hiiRegions.ts's pushes — splat.wesl's fs mixes it against
// hiiNoiseTerm (see dustDetail's own doc above).
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
// component; [4i+2].w (textureWeight) is left 0, since dust never sets it.
// Dust components are consumed by dustMap.wesl's own splat pass now, not
// looped over inside splat.wesl's fs — see binding 2.
//
// DUST MAP (binding 2) — the screen-space depth-sliced optical-depth
// accumulation dustMap.wesl splats the PRIMARY galaxy's dust into,
// additively: (tau_0, tau_1, tau_2, tau_3), one channel per dustSlices bin
// above, replacing splat.wesl's former per-fragment dust loop (see
// splat.wesl's header and the grill-session doc's N1). Purely additive and
// order-independent like the single-column map it replaced — each channel is
// still just an optical-depth sum, only partitioned by depth now instead of
// collapsed to one mean. Sized to reducedSize(render.dustDivisor) — its OWN
// divisor (createGalaxyRenderTargets.ts's rebuildDust), independent of
// fieldTex's: the dust splat is far higher-frequency than the smooth
// emission field, and sharing fieldTex's coarser target decimated thin lanes
// into beads — the bug that motivated giving it a divisor of its own.
//
// dustPresent.wesl (the JWST view) renders into its OWN target, dustViewTex,
// ALSO sized to reducedSize(render.dustDivisor) by that same rebuildDust
// call — so its 1:1 framebuffer-coord texel load stays valid
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
// splat pipeline (splat.wesl imports it, along with dustMapSmp); the splat
// pass that WRITES it never reads it.
//
// Bindings 3/7/8/9 belong to dustDetail.wesl (grid uniform, sfMapSmp,
// sfMapTex, sfMapBlurTex) — declared THERE, not here, because only
// dustMap.wesl's pipeline references them now (the accumulation pass), and
// io.wesl must not force them into every pipeline's auto layout. The
// remaining bindings keep their numbers so every pipeline and bind group
// here stays as written.

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
  debugView: vec4<f32>,
  sfMapChannels: vec4<f32>,
  bubbleView: vec4<f32>,
  dustDetail: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: FieldUniforms;
@group(0) @binding(1) var<storage, read> comps: array<vec4<f32>>;
@group(0) @binding(2) var dustMapTex: texture_2d<f32>;
// Bindings 4/5: the baked ridged-noise volume (dustNoiseBake.wesl) —
// dustMap.wesl's own erosion term AND splat.wesl's hiiNoiseTerm both import
// these two (the latter is what lets HII sprites share dust's ISM texture
// rather than baking a second volume). Every pipeline here uses
// 'layout: auto' (createGalaxyEngine.ts), which derives a bind-group layout
// from the bindings the SHADER actually references, so a pipeline whose
// module does not import a binding never gains its entry — each pipeline's
// bind group stays exactly the bindings its own shader references,
// unaffected by this file growing.
@group(0) @binding(4) var dustNoiseTex: texture_3d<f32>;
@group(0) @binding(5) var dustNoiseSmp: sampler;
// Binding 6: dustMapTex's own sampler — ONLY splat.wesl imports it (see the
// DUST MAP entry above for why its fs needs a filtered UV sample where
// dustMap.wesl is write-only and dustPresent.wesl's still-1:1 read of its
// own divisor-matched target does not). rgba16float is filterable
// in WebGPU core, so a plain 'filtering' sampler suffices — no comparison,
// no manual mip selection.
@group(0) @binding(6) var dustMapSmp: sampler;
