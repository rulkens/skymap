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
//      and emit a per-source debug colour with a hashed per-instance
//      intensity modulation so adjacent picks of the same source
//      visually separate.
//
// ## Why a per-source palette + hashed intensity
//
// The whole point of the overlay is to answer "what would a click
// here hit?".  Distinct colours per survey make it obvious whether
// the cursor is over an SDSS billboard, a 2MRS billboard, or a structure
// ring.  The localIdx-hash brightness modulation keeps two adjacent
// galaxies of the same survey from blurring into a single coloured
// patch — they read as discrete instances with slightly different
// brightnesses.
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

  // Per-source debug palette.  Indexed by 'Source.*' enum value.
  // Codes ≥ 9 (Filaments, Cf4Density, Mcpm) never appear in the pick
  // texture — picking is galaxy/structure only — so the palette stops at
  // Milliquas (8).  An out-of-range code falls back to neutral grey
  // so a future enum widening surfaces visually rather than
  // silently rendering black.
  var col = vec3<f32>(0.7, 0.7, 0.7);
  if (srcCode == 0u) { col = vec3<f32>(0.50, 0.50, 0.50); } // Synthetic
  else if (srcCode == 1u) { col = vec3<f32>(1.00, 0.25, 0.25); } // SDSS — red
  else if (srcCode == 2u) { col = vec3<f32>(0.25, 1.00, 0.25); } // 2MRS — green
  else if (srcCode == 3u) { col = vec3<f32>(0.30, 0.45, 1.00); } // GLADE — blue
  else if (srcCode == 4u) { col = vec3<f32>(1.00, 0.95, 0.25); } // Famous — yellow
  else if (srcCode == 5u) { col = vec3<f32>(0.25, 1.00, 1.00); } // Cluster — cyan
  else if (srcCode == 6u) { col = vec3<f32>(1.00, 0.25, 1.00); } // Supercluster — magenta
  else if (srcCode == 7u) { col = vec3<f32>(1.00, 1.00, 1.00); } // Void — white
  else if (srcCode == 8u) { col = vec3<f32>(1.00, 0.55, 0.10); } // Milliquas — orange

  // Hashed per-instance brightness so two adjacent picks of the same
  // survey don't blur into one solid patch.  Multiplier is Knuth's
  // 2654435761 (golden-ratio prime), then shift to drop the noisy
  // low bits.  Maps to [0.6, 1.0] so even the dimmest instance still
  // reads as distinctly coloured against the background scene.
  let hash = f32((localIdx * 2654435761u) >> 24u) / 255.0;
  let intensity = 0.6 + 0.4 * hash;

  // OVER blend with pre-multiplied alpha.  Alpha = 0.65 is a
  // visibility/transparency compromise — opaque enough to read the
  // colour clearly, transparent enough that the scene structure
  // underneath stays legible for "did I click the right galaxy?"
  // judgments.
  let alpha = 0.65;
  return vec4<f32>(col * intensity * alpha, alpha);
}
