// points/pickFragment.wesl — offscreen r32uint picking fragment.
//
// Sister file to 'colorFragment.wesl'. Both consume the same VSOut
// produced by 'vertex.wesl', but this one writes a 32-bit unsigned
// integer (the packed source/instance identity) instead of a colour.
// Splitting the two fragments into separate modules eliminates a class
// of selection-on-wrong-galaxy bugs that came from one shader module
// servicing two pipelines with diverging fragment paths.
//
// ## What the pick pass does
//
// We re-render the scene into a tiny offscreen 'r32uint' texture where
// each fragment writes the *1-based* packed identity of the billboard
// covering it. The JS side reads back a single pixel from this texture
// under the cursor and decodes the packed value into '(source, localIdx)'.
//
// Why offset by 1: the texture is cleared to 0 before the pass. If we
// wrote 'instanceIdx' directly, instance 0 with sourceCode 0 would be
// indistinguishable from cleared background. Adding 1 keeps 0 as the
// unambiguous 'no hit' sentinel.
//
// ## Why this fragment declares NO bindings
//
// 'fsPick' only reads VSOut fields (in.uv + in.instanceIdx) — no
// uniforms touched here. The SHARED vertex stage in 'vertex.wesl'
// declares '@group(0)' (per-frame Uniforms) and '@group(2)' (per-
// source SourceUniforms); the pick pipeline binds those plus a
// no-op '@group(1)' FadeUniforms (opacity = 1) so its pipeline
// layout matches the visual pipeline's exactly. See pickRenderer.ts
// for the shared-fade-buffer wiring.

import package::points::io::VSOut;
import package::lib::selectionEncoding::PICK_SENTINEL_OFFSET;

// ─── pick fragment stage ──────────────────────────────────────────────
//
// 'fsPick' writes 'vec4<u32>' to @location(0), which maps to the
// 'r32uint' render target declared on the JS side. No blend state on
// the pipeline because integer formats can't be blended; depth test
// resolves overlapping points instead.
//
// Mask choice is set by 'in.isDiskHandoff' (see io.wesl::VSOut):
//   - 0u: circular mask in raw UV (far-field dot regime).
//   - 1u: rotated ellipse matching the visual disk (procedural-disk
//     handoff regime), so the pick area follows the visible disk and
//     doesn't swallow clicks meant for galaxies behind thin disks.
// Both masks discard at r² > 2.25 — a 1.5× forgiveness margin on the
// visual fs's r² > 1.0 cutoff.

@fragment
fn fsPick(in: VSOut) -> @location(0) vec4<u32> {
  // Compute both r² values unconditionally — cheap, and keeps the
  // branches structurally symmetric.  Same rotated-frame transform
  // the visual fs uses (rotate UV by -PA, squash y by safeAB).
  let cs = in.paRotation.x;
  let sn = in.paRotation.y;
  let rotated = vec2<f32>(
    cs * in.uv.x - sn * in.uv.y,
    sn * in.uv.x + cs * in.uv.y,
  );
  let elliptic = vec2<f32>(rotated.x, rotated.y / in.shaded.w);
  let r2 = select(
    dot(in.uv, in.uv),
    dot(elliptic, elliptic),
    in.isDiskHandoff == 1u,
  );
  if (r2 > 2.25) { discard; }

  // Write '(sourceCode << 27 | instance_index) + 1' so background
  // pixels (cleared to 0) are distinguishable from a real hit. The +1
  // keeps 0 as the unambiguous 'no hit' sentinel; even with sourceCode
  // = 0 (the Synthetic survey) and localIdx = 0 the written value is
  // 1, never 0.
  //
  // 'in.instanceIdx' was assembled in the vertex stage from
  // '(source.sourceCode << 27u) | @builtin(instance_index)'. The
  // packing gives every survey a structurally-disjoint identity range
  // (top 5 bits = source code, bottom 27 = local index ≤ 134M), so
  // two galaxies in different surveys can never collide on the same
  // pick value.
  //
  // The g/b/a channels are unused — we only read the r channel back
  // on the JS side. Filling them with 0 keeps the output well-defined.
  return vec4<u32>(in.instanceIdx + PICK_SENTINEL_OFFSET, 0u, 0u, 0u);
}
