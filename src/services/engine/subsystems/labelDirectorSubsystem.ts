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
 * Milky Way label's fade band crossing); other systems wake the loop on
 * their own.
 *
 * ### No layer load-in here — each producer owns its own
 *
 * The director merges, declutters, and flushes; it does NOT fire any
 * layer's load-in fade.  Each producer fires its own first-emit load-in
 * (`produceStructureLabels` per category, the famous / `produceMilkyWayLabel`
 * producers per layer), so the fade reacts to the producer's own
 * visibility decision rather than to the merged, decluttered set.
 *
 * ### Null-renderer guard
 *
 * Renderers attach asynchronously (after the font atlas fetch); the
 * director silently no-ops until both are present.  This mirrors the
 * existing pattern at point-of-use in `filamentsPass`.
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
import { getLabelStyleOverrideVersion } from '../labelStyleOverride';
import { hasUrlGate } from '../../../utils/url/hasUrlGate';

// SPIKE (worktree-fly-to-edge-spike): `?nodeclutter` bypasses the greedy
// overlap cull so labels stay put under continuous camera motion (the cull
// suppresses-then-releases neighbours during an orbit, which reads as
// flicker on a recording). Read once at construction. BACKLOG: promote this
// to a real Labels → Advanced setting (see docs/BACKLOG.md).
const DECLUTTER_DISABLED = hasUrlGate('nodeclutter');

/**
 * Minimum screen-pixel gap between two on-screen label anchors before the
 * lower-`prominencePx` one is suppressed.  Two labels whose anchors land
 * within this many pixels in BOTH x and y collide.  Tuned to keep dense
 * regions (Shapley) readable without over-culling merely-close neighbours.
 *
 * The declutter runs in the director (not per producer) so it de-collides
 * labels ACROSS producers — a structure label vs a famous-galaxy label vs the
 * Milky Way "you are here" marker — which a per-producer pass could never see.
 */
const DECLUTTER_MARGIN_PX = 48;

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
    // Cheap stable signature: per-entry `id:fadeAlpha`, joined, plus a
    // trailing `;O:<version>` term that tracks the labelStyleOverride
    // module's monotonic version counter.
    //
    // Re-upload triggers when ids/count change OR when any entry's
    // `fadeAlpha` differs from the prior frame.  Including `fadeAlpha`
    // matters because `produceMilkyWayLabel` keeps the same `id`
    // across the fade band while the alpha smoothly transitions
    // 0→1→0 as the camera moves; without this term, the GPU instance
    // buffer would stay stuck at whatever alpha was uploaded the
    // first frame the marker became visible.  (Symptom: marker
    // appears at e.g. 0.1 alpha and never brightens as the camera
    // closes in.)
    //
    // The override-version term forces a re-flush whenever the
    // DebugPanel's LabelEffectsSection mutates `labelStyleOverride`.
    // Producers consult the override at frame-build time to swap in
    // outline+glow fields, but the producer's resulting Label objects
    // still carry the same `id` and `fadeAlpha`, so without this term
    // the director would short-circuit and a slider edit would have no
    // visible effect until something else (camera motion, fade) bumped
    // the signature.
    //
    // We deliberately DON'T include world positions or colours — the
    // glyph layout in `labelRenderer.setLabels` is the expensive
    // step we're protecting; static-position producers (milkyWayLabel,
    // structures) keep their positions stable and benefit from the skip.
    //
    // Edge case: a producer mutating a label's `text` while keeping
    // the same `id` will NOT trigger re-upload.  No current producer
    // does this — the Milky Way label has constant text; structures derive text
    // from the structure name which is part of the id space.
    const lIds = labels.map((l) => `${l.id}:${l.fadeAlpha ?? 1}`).join('|');
    const mIds = lines.map((m) => `${m.id}:${m.fadeAlpha ?? 1}`).join('|');
    return `L:${labels.length}:${lIds};M:${lines.length}:${mIds};O:${getLabelStyleOverrideVersion()}`;
  }

  /**
   * Greedy screen-space declutter over the merged label set.  Projects each
   * label's anchor to screen pixels, sorts by `prominencePx` DESC (stable
   * input-order tiebreak), and accepts a label when its on-screen anchor sits
   * ≥ DECLUTTER_MARGIN_PX (in x OR y) from every accepted on-screen anchor.
   * Off-screen labels (behind camera / outside the viewport) are accepted
   * unconditionally and never block.  Decluttering by apparent size (not a
   * flat significance) keeps the large structure under the camera while a
   * small distant label sweeping past during an orbit yields, instead of
   * culling-then-releasing the structure being inspected (flicker).
   *
   * A line whose `ownerLabelId` was culled is dropped with its label so no
   * anchor stem outlives its text; lines without an owner survive.  Returns
   * fresh arrays in original input order (deterministic, sort-independent).
   */
  function declutter(
    labels: readonly Label[],
    lines: readonly MarkerLine[],
    ctx: ReadyFrameContext,
  ): { labels: Label[]; lines: MarkerLine[] } {
    type Projected = {
      readonly index: number;
      readonly prominencePx: number;
      readonly screenX: number;
      readonly screenY: number;
      readonly onScreen: boolean;
    };
    const m = ctx.vp;
    const projected: Projected[] = labels.map((label, index) => {
      // Column-major mat4·vec4 by hand — the lib's vec4.transformMat4
      // allocates per call.
      const wx = label.worldPos[0];
      const wy = label.worldPos[1];
      const wz = label.worldPos[2];
      const clipX = m[0]! * wx + m[4]! * wy + m[8]! * wz + m[12]!;
      const clipY = m[1]! * wx + m[5]! * wy + m[9]! * wz + m[13]!;
      const clipW = m[3]! * wx + m[7]! * wy + m[11]! * wz + m[15]!;
      let screenX = 0;
      let screenY = 0;
      let onScreen = false;
      if (clipW > 0) {
        const ndcX = clipX / clipW;
        const ndcY = clipY / clipW;
        screenX = (ndcX * 0.5 + 0.5) * ctx.canvasSize.width;
        // Flip Y: NDC +Y is up, screen +Y is down.
        screenY = (1 - (ndcY * 0.5 + 0.5)) * ctx.canvasSize.height;
        onScreen = ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1;
      }
      // A label with no prominence (e.g. the Milky Way label) sinks to lowest
      // priority rather than beating real structures.
      return { index, prominencePx: label.prominencePx ?? 0, screenX, screenY, onScreen };
    });

    const order = projected.map((_, i) => i);
    order.sort((a, b) => {
      const d = projected[b]!.prominencePx - projected[a]!.prominencePx;
      return d !== 0 ? d : a - b;
    });
    const accepted: Projected[] = [];
    for (const i of order) {
      const c = projected[i]!;
      if (c.onScreen) {
        let collides = false;
        for (const a of accepted) {
          if (!a.onScreen) continue;
          if (
            Math.abs(c.screenX - a.screenX) < DECLUTTER_MARGIN_PX &&
            Math.abs(c.screenY - a.screenY) < DECLUTTER_MARGIN_PX
          ) {
            collides = true;
            break;
          }
        }
        if (collides) continue;
      }
      accepted.push(c);
    }

    const acceptedIndices = new Set(accepted.map((c) => c.index));
    const outLabels = labels.filter((_, i) => acceptedIndices.has(i));
    const acceptedIds = new Set(outLabels.map((l) => l.id));
    const outLines = lines.filter(
      (line) => line.ownerLabelId === undefined || acceptedIds.has(line.ownerLabelId),
    );
    return { labels: outLabels, lines: outLines };
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

    // Cross-producer declutter — producers emit every candidate (no internal
    // declutter); the director de-collides them together here. The
    // `?nodeclutter` spike gate skips the cull entirely (flicker-free under
    // camera motion, at the cost of overlapping labels in dense regions).
    const { labels, lines } = DECLUTTER_DISABLED
      ? { labels: mergedLabels, lines: mergedLines }
      : declutter(mergedLabels, mergedLines, ctx);

    const sig = signatureOf(labels, lines);
    if (sig !== prevSignature) {
      labelRenderer.setLabels(labels);
      lineRenderer.setLines(lines);
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
