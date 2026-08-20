// starCatalog/pickFragment.wesl — offscreen r32uint picking fragment for the
// survey (Gaia bin) stars.
//
// Sister to 'starCatalog/fragment.wesl' (the visual 'fs' / 'fsLinear'). All
// three consume the same VSOut the shared 'vertex.wesl' produces, but this one
// writes a 32-bit unsigned integer -- the star's packed pick identity -- instead
// of a colour. Keeping the pick fragment in its OWN module (compiled into its
// OWN GPUShaderModule by starCatalogPickRenderer) is the same discipline the
// galaxy points family follows: it keeps the visual and pick fragment paths
// textually independent and sidesteps the WebGPU 'auto'-layout trap by never
// sharing a compiled module across pipelines.
//
// ## What the pick pass does
//
// The pick program re-rasterises the star cut into a small 'r32uint' target
// where each fragment writes the packed identity of the star covering it. JS
// reads back the texel under the cursor and decodes it via 'unpackPick'; 0 is
// the cleared-background sentinel, so every real hit is offset by
// PICK_SENTINEL_OFFSET (below) to stay distinguishable from it.
//
// ## Why the +PICK_SENTINEL_OFFSET is folded into the localIdx
//
// The galaxy points pick offsets the whole PACKED value ('packed + 1'); here we
// add the offset to the record index BEFORE packing -- 'packSelection(source,
// recordIdx + 1)'. The two are equivalent for decode (the offset lands in the
// bottom bits either way, and 'unpackPick' subtracts it back off the masked
// localIdx), and adding it pre-pack keeps the source-code bits pristine: a
// Gaia bin never has enough records to carry 'recordIdx + 1' past the 26-bit
// localIdx field into the source-code bits (the same 26-bit cap the galaxy
// catalogs already live under).
//
// ## Why this fragment is a plain unit-disc dot
//
// The vertex stage already floored the billboard to a ~3 px clickable footprint
// in the pick pass (STAR_PICK_MIN_RADIUS_PX). A plain unit-circle test here
// keeps the pick shape identical to the visual dot -- round, not the square
// quad -- so the clickable area matches what the eye sees. No bindings are
// touched: the fragment reads only VSOut fields ('in.uv' + 'in.recordIdx'); the
// SHARED vertex stage declares the @group(0)/@group(1)/@group(2) bindings that
// actually read storage, and the pick pipeline's explicit layout mirrors them.

import package::starCatalog::io::VSOut;
import package::lib::selectionEncoding::packSelection;
import package::lib::selectionEncoding::PICK_SENTINEL_OFFSET;
import package::lib::selectionEncoding::SOURCE_GAIA_STARS;

@fragment
fn fsPick(in: VSOut) -> @location(0) vec4<u32> {
  // Plain dot: discard fragments outside the inscribed unit circle so the pick
  // shape matches the round visual dot rather than the circumscribing triangle.
  if (dot(in.uv, in.uv) > 1.0) { discard; }

  // Pack '(SOURCE_GAIA_STARS << 26) | (recordIdx + 1)'. The '+ 1' keeps 0 as the
  // unambiguous 'no hit' sentinel (cleared-texture value); 'unpackPick' reverses
  // it and hands the bin-global record index to 'resolveStarRecord'. The g/b/a
  // channels are unused -- only the r channel is read back on the JS side -- so
  // they are filled with 0 to keep the output well-defined.
  let packed = packSelection(SOURCE_GAIA_STARS, in.recordIdx + PICK_SENTINEL_OFFSET);
  return vec4<u32>(packed, 0u, 0u, 0u);
}
