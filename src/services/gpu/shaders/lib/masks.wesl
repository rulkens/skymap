// lib/masks.wesl — common fragment-stage mask shapes.
//
// Three smoothstep patterns recurred across four fragment shaders
// (disks, quads, proceduralDisks, filaments), each with subtly different
// parameter ordering: 'smoothstep(inner, outer, r)' inverted via
// '1.0 - ...' for circular cutoffs in some files but spelled
// 'smoothstep(outer, inner, r)' (relying on smoothstep's symmetry under
// edge swap) in others; the same 'smoothstep(lo, hi, lum)' for
// luminance keying showing up at two call sites with identical
// thresholds; and the two-tailed 'smoothstep(0, fade, x) * (1 -
// smoothstep(1-fade, 1, x))' edge-band mask carved by hand in
// filaments. That subtle parameter-ordering variation made the
// copy-paste-bug risk real — a future renderer copying the wrong
// nearby form would silently get an inverted mask, and the visual
// regression would only show up when a galaxy happened to have
// 'r > outer' for the inverted-edges case.
//
// Naming the shapes makes the intent visible at the call site: you
// read 'circularMask(r, 0.4, 0.5)' and immediately know it's a soft
// disk edge (zero outside, one inside the inner radius), not a
// luminance gate or an edge-band falloff. The parameter order is
// fixed once here — '(value, inner, outer)' for circular, '(value,
// lo, hi)' for luminance, '(axis, fade)' for edge-band — and every
// caller is forced into that ordering, so the previous
// "is it 0.45 first or 0.5 first?" cognitive load disappears.
//
// Why these shapes live alongside 'lib/math' rather than in any
// renderer-specific module: they're pure mathematical patterns —
// no astronomy, no rendering state, no per-galaxy data — that any
// shader carving a soft alpha mask might want. 'lib/math' itself
// stays scoped to scalar primitives (saturate, rot2, sabs, polar
// conversions); the mask shapes are higher-level (they compose
// smoothstep) so they earn their own file rather than crowding the
// math module's docblock.

// ── circularMask ─────────────────────────────────────────────────────
//
// Soft disk-edge mask. Returns 1.0 where r <= inner, 0.0 where
// r >= outer, and a smoothstep ramp between. The '1.0 - smoothstep'
// inversion is folded in: callers pass the inner / outer radii in
// natural order ('inner < outer') and don't have to remember to flip
// the smoothstep edges to get the high-inside-low-outside shape.
//
// The equivalent 'smoothstep(outer, inner, r)' (with edges swapped)
// produces identical output for r outside [inner, outer] but is
// strictly equivalent only because smoothstep is symmetric under
// edge inversion when the input is between the edges; using the
// '1.0 - smoothstep(inner, outer, r)' form keeps the algebraic
// intent explicit and matches the form most call sites used before
// extraction.

fn circularMask(r: f32, inner: f32, outer: f32) -> f32 {
  return 1.0 - smoothstep(inner, outer, r);
}

// ── lumAlpha ─────────────────────────────────────────────────────────
//
// Luminance gate for sky-subtraction-lite. Used by texture-sampling
// fragment stages (texturedDisks, quads) to drop near-black sky pixels in
// SDSS / DSS thumbnail JPEGs that ship with no alpha channel: passing
// 'max(rgba.r, max(rgba.g, rgba.b))' through this gate maps near-zero
// luminance to fully transparent and bright galaxy pixels to fully
// opaque. See the longer note in 'quads.wesl' for the
// project_thumbnail_quality.md context.

fn lumAlpha(lum: f32, lo: f32, hi: f32) -> f32 {
  return smoothstep(lo, hi, lum);
}

// ── edgeBandMask ─────────────────────────────────────────────────────
//
// Two-tailed edge-band mask along a [0, 1] axis. Fades in from 0 over
// the first 'fade' units, stays at 1.0 in the middle band, and fades
// out to 0 over the last 'fade' units before 1. Used by filaments to
// shape the perpendicular falloff of each line segment so the
// instanced-quad rendering ends with a soft anti-aliased edge instead
// of a hard pixel cliff.
//
// Caller passes 'axis' in [0, 1] (typically a quad-corner uv
// component); 'fade' controls how wide each tail is. fade = 0.1
// produces a 10%-on / 80%-flat / 10%-off shape; fade = 0.5 collapses
// the flat middle and gives a triangular-ish ramp; fade > 0.5 starts
// double-counting the tails and is undefined.

fn edgeBandMask(axis: f32, fade: f32) -> f32 {
  return smoothstep(0.0, fade, axis) * (1.0 - smoothstep(1.0 - fade, 1.0, axis));
}
