/**
 * frameProgram — the FRAME as data, and the timing slots derived from it.
 *
 * A frame is an ordered sequence of steps: a flow compute, a volume render,
 * an HDR render, a tone-mapping composite, the cosmological swap-chain overlay
 * render, then the near-field tail — the foreground bodies, their composite
 * onto the swap chain, and the near-field captions. Pre-unification that
 * sequence lived as an imperative call chain spread across `renderFrame` and
 * two hand-wired HDR encoders — the order was implicit in which function
 * called which, and untestable without a GPU device. `frameProgram` returns
 * that same sequence as a plain `FrameStep[]`: the order is now inspectable
 * data one array deep, and the executor is the single imperative site that
 * walks it. See the renderer unification design
 * (`docs/superpowers/specs/2026-06-29-renderer-unification-design.md`) for the
 * essential/accidental split this data model rests on.
 *
 * The near-field tail (the zoom-to-earth fold) is now wired: a
 * `foreground:0` render draws the true-scale bodies (Sun, Earth) through the
 * NEAR0 slab into the depth-bearing foreground target, a `foreground:0→swap`
 * composite lays them over the tonemapped scene, then a NEAR0 swap render
 * draws the Sun/Earth captions. The tail's step order is the visible
 * "captions over bodies, bodies over cosmological labels" decision: the
 * near-field swap render (captions) follows the foreground composite so
 * captions land on top of the bodies, and that composite follows the
 * cosmological swap render so the opaque bodies occlude the cosmological
 * labels behind them — an ordering choice now readable in the program rather
 * than buried in an `encodeForegroundOver`-after-`encodeUiOverlay` convention.
 *
 * There is no `volume→hdr` composite — the volume offscreen is merged into
 * HDR by the `volume-upsample` *layer* inside the HDR render step, not a
 * separate whole-texture composite (plan-time decision 3). The two composites
 * in the program share one `tone` object by reference: the tone-map `hdr→swap`
 * (where the HDR scene is compressed to display range before the overlay
 * layers draw on top) and the `foreground:0→swap` OVER, so the tone curve is
 * identical across the Sun's limb.
 */

import type { FrameStep } from '../../../@types/engine/frame/FrameStep';
import type { ContentLayer } from '../../../@types/engine/frame/ContentLayer';
import type { ToneMap } from '../../../@types/rendering/ToneMap';
import { COSMO, NEAR0 } from './slabs';
import { CONTENT_LAYERS } from './passes';

/**
 * Build this frame's step program. `tone` is threaded into BOTH composites —
 * the same object reference — so the tone-map curve is identical where the
 * foreground bodies meet the tonemapped cosmological scene. The cosmological
 * body (compute → volume → hdr → tone-map → swap) projects through the COSMO
 * slab; the near-field tail (foreground bodies, their composite, captions)
 * projects through the NEAR0 slab.
 */
export function frameProgram(tone: ToneMap): readonly FrameStep[] {
  return [
    { kind: 'compute', name: 'flow' },
    { kind: 'render', target: 'volume', slab: COSMO },
    { kind: 'render', target: 'hdr', slab: COSMO },
    { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone } },
    { kind: 'render', target: 'swap', slab: COSMO },
    // Near-field tail (zoom-to-earth fold). The step ORDER is the visible
    // "captions over bodies, bodies over cosmological labels" decision:
    //   - the foreground bodies composite (OVER) after the cosmological swap
    //     render, so the opaque Sun/Earth occlude the cosmological labels;
    //   - the near-field captions render AFTER that composite, so they land on
    //     top of the bodies.
    // The `tone` here is the SAME object the hdr→swap composite carries, which
    // is how the shared tone curve across the Sun's limb is enforced.
    { kind: 'render', target: 'foreground:0', slab: NEAR0 },
    { kind: 'composite', step: { source: 'foreground:0', dest: 'swap', blend: 'over', tone } },
    { kind: 'render', target: 'swap', slab: NEAR0 },
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
 * frame's execution order. Deriving the slot order this way rather than
 * hand-maintaining a list means it's a pure function of the same program the
 * executor walks, so it can't drift from what actually runs.
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
 * content-layer registry rather than hand-maintained, so the two consumers
 * can never see a different slot list than what the frame actually runs.
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
