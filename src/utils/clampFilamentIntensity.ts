/**
 * clampFilamentIntensity — fold the filament-overlay intensity scale to the
 * bounds the filament GPU pipeline can survive, at the renderer's point of use.
 *
 * ### Why the clamp lives here, not on the write path
 *
 * The settings store holds raw *intent* — whatever was requested (slider,
 * deep-link, devtools call). The filament renderer is the one component that
 * OWNS the GPU constraint this knob feeds: the fragment multiplies intensity
 * into the additive-blend alpha, and a negative value would drive a negative
 * alpha into a blend the pipeline configures as `srcFactor: one` additive —
 * undefined output that darkens rather than glows. Above 1 it just saturates,
 * but the upper bound keeps the slider's UI window and the GPU window aligned.
 * That [0, 1] limit is a detail of the blend math, not of the stored value.
 *
 * The rejected alternative clamps at write time in the settings table, which
 * braids three independent concerns into one line — the GPU-safety constraint,
 * the slider's UI bounds, and the stored value — and silently rewrites intent.
 * Pulling the clamp to the consumer gives it a single home: the store keeps
 * intent, the slider bounds the UI, the renderer enforces its own limit here,
 * the frame it uploads it.
 */

export function clampFilamentIntensity(intensity: number): number {
  return Math.max(0, Math.min(1, intensity));
}
