// pickDebugOverlay/fragment.wesl — sample the r32uint pick texture and
// colour-map it onto the tone-mapped swap chain.
//
// ## What it does
//
// At every viewport pixel:
//   1. Read the r32uint pick texel via 'textureLoad' (integer textures
//      can't be 'textureSample'd, and we want exact 1:1 texel mapping
//      anyway so there'd be nothing to filter).
//   2. If the texel is 0, emit a transparent fragment so the scene
//      shows through unchanged (0 is the "no hit" sentinel — see
//      'PICK_SENTINEL_OFFSET' in 'pickFragment.wesl').
//   3. Otherwise, decode 'packed - 1' as '(sourceCode << 27) | localIdx'
//      and emit a per-source hue with a hashed per-instance brightness
//      so adjacent picks of the same source visually separate.
//
// ## Why colour BY SOURCE CODE, and why the golden angle
//
// The whole point of the overlay is to answer 'what would a click here
// hit, and WHICH source claimed this pixel?'. So every pixel takes its
// hue straight from the packed source code — an SDSS billboard, a 2MRS
// billboard, a cluster ring, a Gaia star and a famous star each read as
// their own stable colour.
//
// The hue comes from golden-angle spacing rather than a hand-maintained
// colour table: 'hue = fract(sourceCode * 0.618034)'. 0.618034 is the
// golden-ratio conjugate (1/phi); stepping the hue circle by it gives
// the maximally-spread, low-discrepancy sequence — adjacent source codes
// land far apart on the wheel, and ANY source (present or future) gets a
// well-separated hue with zero colours to maintain. A literal palette
// would need a new branch every time a pickable source is added; this is
// self-maintaining, matching the house 'derive, don't enumerate' style.
//
// The localIdx hash modulates BRIGHTNESS (HSV value), not hue, so two
// adjacent instances of the same source read as discrete points of the
// same colour rather than blurring into one solid patch — while the hue
// stays fully readable as 'which source'.
//
// ## Why pre-multiplied alpha
//
// Drawn via OVER blend ('srcFactor: one, dstFactor: one-minus-src-
// alpha') so the overlay sits on top of the tone-mapped frame.
// Pre-multiplying RGB by alpha at the fragment matches the rest of
// the UI overlay stack (markerLines, labels, structureMarker).

import package::pickDebugOverlay::io::VSOut;
import package::lib::selectionEncoding::PICK_SENTINEL_OFFSET;
import package::lib::selectionEncoding::SELECTION_SOURCE_SHIFT;
import package::lib::selectionEncoding::SELECTION_LOCAL_IDX_MASK;
import package::lib::selectionEncoding::SOURCE_GAIA_STARS;
import package::lib::util::hueToRgb;

@group(0) @binding(0) var pickTex: texture_2d<u32>;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Integer textureDimensions returns the same width/height the JS side
  // allocated.  Multiply by UV to get the per-pixel texel coordinate.
  let dims = vec2<f32>(textureDimensions(pickTex));
  let coord = vec2<i32>(in.uv * dims);
  let packed = textureLoad(pickTex, coord, 0).r;

  // Sentinel — background, draw nothing so the scene shows through.
  if (packed == 0u) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  let raw = packed - PICK_SENTINEL_OFFSET;
  let srcCode = raw >> SELECTION_SOURCE_SHIFT;
  let localIdx = raw & SELECTION_LOCAL_IDX_MASK;

  // OVER blend with pre-multiplied alpha.  Alpha = 0.65 is a
  // visibility/transparency compromise — opaque enough to read the
  // colour clearly, transparent enough that the scene structure
  // underneath stays legible for 'did I click the right galaxy?'
  // judgments.
  let alpha = 0.65;

  // Reserved all-ones sentinel band (source code 31 — see
  // 'selectionEncoding'). It never denotes a real hit, so it must stay
  // visually disjoint from every golden-angle hue: paint it near-black
  // so a stray sentinel texel reads as 'nothing here', not as a source.
  if (srcCode == 31u) {
    return vec4<f32>(vec3<f32>(0.02) * alpha, alpha);
  }

  // Hue straight from the source code via golden-angle spacing — no
  // colour table to maintain, distant hues for adjacent codes.
  let hue = fract(f32(srcCode) * 0.618034);
  let rgb = hueToRgb(hue);

  // Hashed per-instance brightness so two adjacent picks of the same
  // source don't blur into one solid patch.  Multiplier is Knuth's
  // 2654435761 (golden-ratio prime), then shift to drop the noisy
  // low bits.  Maps to [0.55, 1.0] so even the dimmest instance still
  // reads as distinctly coloured against the background scene while the
  // hue stays legible.
  let hash = f32((localIdx * 2654435761u) >> 24u) / 255.0;
  var value = 0.55 + 0.45 * hash;

  // GaiaStars (imported SOURCE_GAIA_STARS — the single WESL home for the code,
  // mirror of TS Source.GaiaStars, parity-tested) is a survey-wide point cloud:
  // thousands of star footprints blanket the overlay, and at the golden-angle
  // value band above they drown out the sparse sources (bodies, famous stars)
  // that this debug view exists to make readable. Dim just this one dense source
  // to ~[0.14, 0.25], keeping its hue and the per-instance hash variation so
  // individual stars still separate up close. A general per-source brightness
  // table would be over-engineering for a single outlier — one dense source
  // doesn't warrant enumerating brightness for the self-maintaining golden-angle
  // set.
  if (srcCode == SOURCE_GAIA_STARS) {
    value = value * 0.25;
  }

  return vec4<f32>(rgb * value * alpha, alpha);
}
