/**
 * clampFlowParams — fold every flow numeric knob to the bounds the flow GPU
 * pipeline can actually survive, at the renderer's point of use.
 *
 * ### Why the clamp lives here, not on the write path
 *
 * The settings store holds raw *intent* — whatever was requested (slider,
 * deep-link, devtools call). The flow renderer is the one component that OWNS
 * the GPU constraints these knobs feed: `count` indexes a fixed
 * `MAX_PARTICLES`-sized particle buffer (an overrun is catastrophic — dispatch
 * and draw past the allocation), and `trail` of exactly 0 makes the advect
 * integrator's per-iteration step collapse so the compute loop never breaks —
 * a GPU hang that freezes the whole canvas. Those limits are a detail of the
 * buffer geometry and the integrator, not of the stored value.
 *
 * The rejected alternative clamps at write time in the settings table, which
 * braids three independent concerns into one line — the GPU-safety constraint,
 * the slider's UI bounds, and the stored value — and silently rewrites intent.
 * Worse, `trail` ended up floored in two places (the table AND the renderer).
 * Pulling the clamp to the consumer gives each clamp a single home: the store
 * keeps intent, the slider bounds the UI, the renderer enforces its own limits
 * here, the frame it uploads them.
 *
 * Copy-on-write: returns a fresh `FlowSettings` so the caller's stored value is
 * never mutated. `enabled` / `mode` are not GPU-numeric, so they pass through.
 */

import type { FlowSettings } from '../@types/settings/FlowSettings';
import { MAX_PARTICLES, MIN_TRAIL_STEP } from '../data/flowFieldConstants';

export function clampFlowParams(flow: FlowSettings): FlowSettings {
  return {
    enabled: flow.enabled,
    mode: flow.mode,
    // Round + clamp into the buffer-capacity window. The catastrophic guard:
    // dispatch and draw counts derive from this, against a fixed buffer.
    count: Math.max(0, Math.min(MAX_PARTICLES, Math.round(flow.count))),
    // Floor so the advect loop always progresses (a 0 hangs the GPU).
    trail: Math.max(MIN_TRAIL_STEP, flow.trail),
    flowSpeed: Math.max(0, flow.flowSpeed),
    intensity: Math.max(0, Math.min(1, flow.intensity)),
    densityBias: Math.max(0, Math.min(1, flow.densityBias)),
    wander: Math.max(0, flow.wander),
    boundaryFadeWidth: Math.max(0, Math.min(0.5, flow.boundaryFadeWidth)),
  };
}
