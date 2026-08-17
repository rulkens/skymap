/**
 * clampExposure — fold the tone-map exposure multiplier to the
 * float-buffer-safe / non-black range, at the post-process pass's point of use.
 *
 * ### Why the clamp lives here, not on the write path
 *
 * The settings store holds raw *intent* — whatever was requested (slider,
 * deep-link, devtools `setExposure(1e9)`). The post-process pass is the one
 * component that OWNS the limits this knob feeds: the upper bound keeps a
 * runaway value from blowing out the HDR uniform, and the lower bound stops a
 * near-zero multiply from collapsing the signal into a black frame. Those
 * limits are a detail of the HDR buffer + tone-map curve, not of the stored
 * value.
 *
 * The rejected alternative clamps at write time in the settings table, which
 * braids three independent concerns into one line — the GPU-safety constraint,
 * the slider's UI bounds, and the stored value — and silently rewrites intent.
 * Pulling the clamp to the consumer gives it a single home: the store keeps
 * intent, the slider bounds the UI, the pass enforces its own limits here, the
 * frame it uploads the uniform.
 */
export function clampExposure(exposure: number): number {
  return Math.max(0.05, Math.min(16, exposure));
}
