// structureMarker/ringPick.wesl — offscreen r32uint picking fragment for
// structure rings (cluster / supercluster / void / group).
//
// Sister to structureMarker/ring.wesl (the visible-ring fragment). Both
// consume the same VsOut produced by the shared vertex stage in
// ring.wesl; this one writes the packed structure identity into the pick
// texture instead of the visible-ring colour.
//
// ## Why a separate pick fragment
//
// Same rationale as points/pickFragment.wesl: a single shader module
// servicing both the visual and pick paths textually couples the two
// pipelines.  Each renderer compiles its own GPUShaderModule from the
// source it actually needs, which structurally sidesteps the WebGPU
// 'auto' bind-group-layout trap and keeps the compile graph small.
//
// ## Hit-target shape: filled padded disk, not the visible ring
//
// The visible ring is ~2-3 px thick.  Asking the user to click that
// precise band is hostile.  Instead the pick fragment renders a FILLED
// disk at the ring's radius plus PICK_PADDING_PX (matches the galaxy
// path's PICK_PADDING_PX in data/pickPaddingPx.ts — see that constant's
// doc for the empirical 4-px rationale).  Inside the disk: write the
// packed identity.  Outside: discard.
//
// Why discard rather than write 0: the pick texture is cleared to 0
// before the pass, and 0 is the 'no hit' sentinel.  Writing 0 from a
// fragment shader and depth-test passing is indistinguishable from
// the clear — so it's safer to discard and let the next-back fragment
// (which may be a galaxy behind the ring) get its chance at the pixel.
//
// ## Pick encoding
//
// Same '(sourceCode << SELECTION_SOURCE_SHIFT) | (structureIndex +
// PICK_SENTINEL_OFFSET)' packing the galaxy path uses — imported from the
// shared lib rather than hardcoded, so a future shift change can't leave
// this one shader silently packing at the old width.  The per-category
// SourceUniforms block carries
// the source code (5/6/7/15 for cluster/supercluster/void/group — see
// sources.ts and lib/selectionEncoding.wesl).  'structureIndex' is the
// @builtin(instance_index) of this draw, populated in the vertex stage
// (ring.wesl) and forwarded through VsOut.structureIndex — flat-interpolated
// so the integer arrives unchanged across all six vertices of the
// instance.
//
// ## Why import VsOut from io.wesl rather than from ring.wesl
//
// The struct itself lives in structureMarker/io.wesl (the shared-struct
// module both halo + ring import from).  ring.wesl declares the
// @vertex fn that produces it but does NOT re-export the struct; the
// canonical path is the io module.

import package::structureMarker::io::VsOut;
import package::lib::sourceUniforms::SourceUniforms;
import package::lib::selectionEncoding::PICK_SENTINEL_OFFSET;
import package::lib::selectionEncoding::SELECTION_SOURCE_SHIFT;

// Re-declare the per-source binding here so this module is self-
// contained.  WESL has no global state — '@group(N) @binding(M)' is
// module-local and cannot be exported.  The same layout numbers are
// declared in structureMarker/ring.wesl (visible-ring path); WGSL is
// fine with multiple modules declaring the same binding so long as
// the layout matches, and the SourceUniforms struct is imported from
// the single lib authority so the byte layout cannot drift across
// modules.
//
// Group choice: @group(2) mirrors the points/SourceUniforms slot (see
// lib/sourceUniforms.wesl's docstring) — @group(0) is per-frame
// CameraUniforms, @group(1) is FadeUniforms, @group(2) is per-source.
// The pick pipeline binds (0, 1, 2) so its pipeline layout matches the
// visual pipeline's, even though this fragment only reads @group(2).
@group(2) @binding(0) var<uniform> source: SourceUniforms;

@fragment
fn fsRingPick(in: VsOut) -> @location(0) vec4<u32> {
  // 'in.uv' is in [-MARGIN, +MARGIN]^2 over the padded quad emitted by
  // ring.wesl's vertex stage (the MARGIN constant lives there).  At
  // |uv| == 1 we're exactly at the world-space ring radius; the padded
  // quad extends slightly past that.  We accept any fragment inside
  // the padded quad's inscribed disk (r2 <= MARGIN^2) so the user can
  // click anywhere on the ring's circular silhouette — including the
  // padded apron — without needing to land on the thin visible band.
  //
  // The cutoff is MARGIN^2 == 1.21 (see RING_QUAD_MARGIN in ring.wesl),
  // not 1.0: a 1.0 cutoff would discard the padded apron and shrink the
  // hit target to the bare visible ring, defeating the padding.
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.21) { discard; }

  // Faded / invisible rings must not be pickable.  'in.alpha' carries
  // ringAlpha (the vertex stage in ring.wesl selects ringColorAndAlpha.w
  // into VsOut.alpha).  produceMarkers emits one instance per marker-
  // bearing structure regardless of fade — faded ones at alpha 0 — so the
  // CPU descriptor list stays index-aligned with getStructuresForCategory and
  // the @builtin(instance_index) packed below resolves to the right structure.
  // We discard the alpha-0 instances here so those invisible rings don't
  // become pick targets while still occupying their instance slot.
  if (in.alpha <= 0.0) { discard; }

  // 'in.structureIndex' was assembled in the vertex stage as
  // 'u32(@builtin(instance_index))'.  The shared VsOut carries it so
  // both the visible-ring fragment (which doesn't use it) and this
  // pick fragment can read from one interpolant set.
  let packed: u32 = (source.sourceCode << SELECTION_SOURCE_SHIFT) | (in.structureIndex + PICK_SENTINEL_OFFSET);
  return vec4<u32>(packed, 0u, 0u, 0u);
}
