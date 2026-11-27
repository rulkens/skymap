// One/one premultiplied, every LIGHT-EMITTING layer: the graph owns the clear, each pass
// LOADs and adds. Fifth copy of this literal was the trigger (tracePass, splatPass,
// galaxyOverlayPass, volpathPass, boxPreviewPass) — an omitted blend REPLACES everything
// drawn beneath it instead of adding to it, alpha lane included, so a layer that forgets
// this errors loud (missing import) rather than silently wiping the frame. The one
// exception is boxPreviewPass (OVERLAY_BLEND): it's a UI overlay, not a light
// emitter, so it must stay visible over a bright raymarch instead of washing out into it.
export const LAYER_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
};
