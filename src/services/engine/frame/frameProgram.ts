/**
 * frameProgram — the FRAME as data, and the timing slots derived from it.
 *
 * A frame is an ordered sequence of steps: a flow compute, a volume render,
 * an HDR render, a tone-mapping composite, then the swap-chain overlay
 * render. Pre-unification that sequence lived as an imperative call chain
 * spread across `renderFrame` and two hand-wired HDR encoders — the order
 * was implicit in which function called which, and untestable without a GPU
 * device. `frameProgram` returns that same sequence as a plain
 * `FrameStep[]`: the order is now inspectable data one array deep, and the
 * executor is the single imperative site that walks it. See the renderer
 * unification design (`docs/superpowers/specs/2026-06-29-renderer-unification-design.md`)
 * for the essential/accidental split this data model rests on.
 *
 * The program deliberately omits the two PR-#386 near-field steps (the
 * `foreground:0` render and the `NEAR0` swap render): those depend on a
 * `renderOrigin` the zoom-to-earth fold hasn't defined yet, so the NEAR0
 * slab hosts no layers and appears in no step. There is also no
 * `volume→hdr` composite — the volume offscreen is merged into HDR by the
 * `volume-upsample` *layer* inside the HDR render step, not a separate
 * whole-texture composite (plan-time decision 3). The one composite in the
 * program is the tone-map: `hdr→swap`, which is where the HDR scene is
 * compressed to display range before the overlay layers draw on top.
 */

import type { FrameStep } from '../../../@types/engine/frame/FrameStep';
import type { ContentLayer } from '../../../@types/engine/frame/ContentLayer';
import type { ToneMap } from '../../../@types/rendering/ToneMap';
import { COSMO } from './slabs';
import { CONTENT_LAYERS } from './passes';

/**
 * Build this frame's step program. `tone` is threaded into the single
 * tone-map composite; every render step projects through the cosmological
 * slab (the near-field slab hosts no layers until the zoom-to-earth fold).
 */
export function frameProgram(tone: ToneMap): readonly FrameStep[] {
  return [
    { kind: 'compute', name: 'flow' },
    { kind: 'render', target: 'volume', slab: COSMO },
    { kind: 'render', target: 'hdr', slab: COSMO },
    { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone } },
    { kind: 'render', target: 'swap', slab: COSMO },
  ];
}

/**
 * Derive the ordered GPU-timing slot names from a program + the content-layer
 * registry (plan-time decision 5). Each step contributes:
 *
 *   - `'render'`   → the names of its matching layers (same `target` and
 *     `slab`), in registry order — one timing slot billed per layer.
 *   - `'composite'`→ a single `'<source>→<dest>'` slot (the unicode arrow),
 *     e.g. the tone-map's `'hdr→swap'`.
 *   - `'compute'`  → nothing; compute dispatches aren't timed as content slots.
 *
 * `'pick'` (the parallel r32uint pick pass) is appended last, matching the
 * frame's execution order. This replaces the hand-maintained
 * `TIMED_SLOT_NAMES` list: the slot order is now a pure function of the same
 * program the executor walks, so it can't drift from what actually runs.
 */
export function timedSlotsOf(
  program: readonly FrameStep[],
  layers: readonly ContentLayer[],
): readonly string[] {
  const slots: string[] = [];
  for (const step of program) {
    if (step.kind === 'render') {
      for (const layer of layers) {
        if (layer.target === step.target && layer.slab === step.slab) {
          slots.push(layer.name);
        }
      }
    } else if (step.kind === 'composite') {
      slots.push(`${step.step.source}→${step.step.dest}`);
    }
    // 'compute' steps contribute no timing slot.
  }
  slots.push('pick');
  return slots;
}

/**
 * The engine's ordered GPU-timing slots — the single source of truth for both
 * query-set slot allocation (`createGpuTimingService`) and DebugPanel display
 * order (`GpuTimingsSection`). Derived from the real FRAME program + the
 * content-layer registry, replacing the hand-maintained `TIMED_SLOT_NAMES`.
 *
 * The tone values are placeholders: `timedSlotsOf` only reads step kinds and
 * `(target, slab)` — the composite's `tone` never affects a slot NAME — so a
 * fixed `{ exposure: 1, curve: 0 }` yields the same list every real frame's
 * `frameProgram(tone)` would.
 */
export const TIMED_SLOTS: readonly string[] = timedSlotsOf(
  frameProgram({ exposure: 1, curve: 0 }),
  CONTENT_LAYERS,
);
