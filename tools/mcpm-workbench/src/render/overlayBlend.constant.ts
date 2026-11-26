// Premultiplied-over, for the gizmo/wireframe overlay only: with fragment alpha 1.0 (opaque
// glyphs/lines — see boxLines.wesl's fs/fsGlyph) this REPLACES the destination pixel instead
// of adding to it, so the gizmo stays legible over a bright raymarch region instead of
// blowing out additively.
export const OVERLAY_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};
