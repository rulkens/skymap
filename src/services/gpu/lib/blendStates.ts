/**
 * blendStates — the two GPUBlendState descriptors that nearly every
 * overlay/world-space pipeline in the renderer reaches for: additive
 * emission and premultiplied OVER.
 *
 * ## Why two shared consts instead of a per-renderer literal
 *
 * A dozen render pipelines each inlined the same four-line
 * `blend: { color: {...}, alpha: {...} }` descriptor. Two blend algebras
 * account for almost all of them:
 *
 *   - ADDITIVE (`one`/`one` on both channels): emissive light that SUMS
 *     into the HDR target — points, filaments, flow field, horizon shell,
 *     the volume field, structure halos, star points, orbit trails, the
 *     Milky Way star pass, the additive impostor branch. Overlapping
 *     emitters accumulate naturally.
 *   - PREMULTIPLIED OVER (`one`/`one-minus-src-alpha`): anti-aliased
 *     coverage-over-background for glyphs and rings whose fragment already
 *     multiplied colour by coverage — labels, marker lines, debug lines,
 *     selection rings, structure marker rings.
 *
 * Twelve-plus byte-identical copies of the same factor/op quartet are
 * twelve chances for a silent drift: flip one factor and that one pass
 * blends wrong while the rest stay correct, which reads as "only this
 * renderer is broken" rather than pointing at the shared algebra. Naming
 * each algebra once makes the intent legible at every call site and the
 * value single-sourced, the same way `lib/cameraUniforms.ts` single-sources
 * the camera prefix.
 *
 * ## What deliberately does NOT fold in here
 *
 * Blend descriptors whose factors differ from these two are genuinely
 * different primitives, not copies to consolidate:
 *
 *   - `instancedQuadRenderer`'s straight-alpha OVER branch
 *     (`color.srcFactor: 'src-alpha'`) — its fragment has NOT premultiplied,
 *     so it needs the extra src-alpha multiply. Not this OVER.
 *   - `milkyWayCloudRenderer`'s dust-multiply (`dst`/`zero`) — physical
 *     extinction (`T * dst`), test-pinned. A different algebra entirely.
 *
 * Folding either into a shared "over"/"additive" name would invite a silent
 * visual bug, so they stay inline at their single call site.
 *
 * (This file exports two consts — the one-symbol-per-file rule is a `utils/`
 * and `@types/` rule; the gpu-wide shared-primitives `lib/` (a sibling to
 * `renderers/` and `passes/`) groups one domain's constants, like
 * `lib/unitQuad.ts` groups the corner data with its layout.)
 *
 * @module
 */

/**
 * Additive emission: `src + dst` on both colour and alpha. Overlapping
 * emitters sum their light into the HDR target. Used by every emissive
 * world-space pass (points, filaments, flow field, volume field, halos,
 * the Milky Way star pass, ...).
 */
export const ADDITIVE_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
};

/**
 * Premultiplied OVER: `src + dst * (1 - src.a)`. The fragment has already
 * multiplied its colour by coverage/alpha, so source arrives premultiplied
 * and the target is attenuated by `1 - src.a`. Used by anti-aliased overlay
 * glyphs and rings (labels, marker/debug lines, selection + structure rings).
 */
export const PREMULTIPLIED_OVER_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};
