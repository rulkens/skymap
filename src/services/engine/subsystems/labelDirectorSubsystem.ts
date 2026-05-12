/**
 * labelDirectorSubsystem — owns the labelRenderer + markerLineRenderer
 * setLabels/setLines calls, polling registered LabelProducers each frame
 * and flushing the merged result once.
 *
 * ### Why a director?
 *
 * Both renderers' set-methods REPLACE the full set; if two producers
 * each call setLabels with their own slice, the second wins and the
 * first vanishes.  The director merges first, flushes once.
 *
 * ### Change detection
 *
 * The merged label/line arrays are signature-hashed (id-based string
 * concatenation) and the GPU upload is skipped when the signature
 * matches the previous frame.  Hashing costs ~O(N labels), much cheaper
 * than the GPU buffer write that would otherwise happen every frame.
 *
 * ### Awake aggregation
 *
 * If any producer returns `awake: true`, the director calls
 * `state.subsystems.scheduler.requestRender()` once.  This is the only
 * loop-wake mechanism for animations driven by label state (e.g. the
 * you-are-here fade band crossing); other systems wake the loop on
 * their own.
 *
 * ### Null-renderer guard
 *
 * Renderers attach asynchronously (after the font atlas fetch); the
 * director silently no-ops until both are present.  This mirrors the
 * existing pattern at point-of-use in `filamentsPass` and the prior
 * `youAreHereSubsystem`.
 */

import type { LabelRenderer } from '../../../@types/rendering/LabelRenderer';
import type { Label } from '../../../@types/rendering/Label';
import type { MarkerLineRenderer } from '../../../@types/rendering/MarkerLineRenderer';
import type { MarkerLine } from '../../../@types/rendering/MarkerLine';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { LabelProducer } from '../../../@types/engine/subsystems/LabelProducer';
import type { LabelDirectorSubsystem } from '../../../@types/engine/subsystems/LabelDirectorSubsystem';

export function createLabelDirectorSubsystem(): LabelDirectorSubsystem {
  let labelRenderer: LabelRenderer | null = null;
  let lineRenderer: MarkerLineRenderer | null = null;
  let producers: readonly LabelProducer[] = [];
  // Signature of the last flushed (labels, lines) tuple, or null on the
  // first frame.  Empty string is a valid signature (no labels, no lines)
  // and is distinct from null.
  let prevSignature: string | null = null;

  function attachRenderers(label: LabelRenderer, line: MarkerLineRenderer): void {
    labelRenderer = label;
    lineRenderer = line;
    prevSignature = null; // force the next frame to re-flush
  }

  function registerProducer(producer: LabelProducer): void {
    // Copy-on-write append — keeps the producers array immutable from
    // any caller's perspective.
    producers = [...producers, producer];
  }

  function signatureOf(labels: readonly Label[], lines: readonly MarkerLine[]): string {
    // Cheap stable signature: id-list + length.  Producers are expected
    // to emit stable ids when their contribution is unchanged; the
    // signature only flips when ids change or the count changes, which
    // is exactly when we need a GPU re-upload.  Edge case: a producer
    // changing a label's *text* but keeping the same id will NOT trigger
    // re-upload — accept this; the only current producer with mutable
    // text is youAreHere (text is constant) and poiSubsystem (text is
    // derived from POI name, which is included via setPois replacement
    // → new ids if names change in practice).
    const lIds = labels.map((l) => l.id).join('|');
    const mIds = lines.map((m) => m.id).join('|');
    return `L:${labels.length}:${lIds};M:${lines.length}:${mIds}`;
  }

  function runFrame(state: EngineState, ctx: ReadyFrameContext): void {
    if (!labelRenderer || !lineRenderer) return;

    // Collect outputs.  Producers are pure of state, so we just call
    // each and concatenate.  The director does NOT cache per-producer
    // output between frames — change detection happens on the merged
    // arrays via signature.
    const mergedLabels: Label[] = [];
    const mergedLines: MarkerLine[] = [];
    let anyAwake = false;
    for (const p of producers) {
      const out = p.produceLabels(state, ctx);
      for (const l of out.labels) mergedLabels.push(l);
      for (const m of out.lines) mergedLines.push(m);
      if (out.awake) anyAwake = true;
    }

    const sig = signatureOf(mergedLabels, mergedLines);
    if (sig !== prevSignature) {
      labelRenderer.setLabels(mergedLabels);
      lineRenderer.setLines(mergedLines);
      prevSignature = sig;
    }

    if (anyAwake) {
      state.subsystems.scheduler.requestRender();
    }
  }

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the label director is one of
  // the engine's ~13 teardown targets, and the shared shape lets
  // engine.destroy() iterate uniformly across the bag.
  const director: LabelDirectorSubsystem = {
    attachRenderers,
    registerProducer,
    runFrame,
    destroy(): void {
      // Intentionally empty — see the type-level docstring for why.
    },
  };
  director satisfies Destroyable;
  return director;
}
