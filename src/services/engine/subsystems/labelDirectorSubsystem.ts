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
 * If any producer returns `awake: true`, or any appear/disappear
 * envelope (below) is mid-ramp, the director calls
 * `state.subsystems.scheduler.requestRender()` once.  This is the only
 * loop-wake mechanism for animations driven by label state (e.g. the
 * Milky Way label's fade band crossing); other systems wake the loop on
 * their own.
 *
 * ### Appear/disappear envelope
 *
 * Label EMISSION is a boolean cliff: `focusedOnly` gates rows inside the
 * producers, and the greedy declutter culls per frame — either way a
 * label that stops being emitted would vanish on the next frame, and a
 * new one would pop in at full opacity.  The fade registry can't help:
 * it fades LAYERS, and these transitions happen per-row, below layer
 * granularity.  The director is the one place that sees every label's
 * per-frame presence regardless of which producer (or declutter
 * decision) drives it, so the envelope lives here — below declutter, so
 * declutter's own culls fade too, and above the renderers, so it is one
 * mechanism for all producers instead of a hand-rolled tail in each.
 * (The alternative — per-producer envelopes — would need a time source
 * and mutable state in what are today pure per-frame readers, times
 * three.)
 *
 * Each decluttered label id gets a ramp record; the envelope alpha is
 * 'startAlpha + (target − startAlpha) · smoothstep(elapsed/ENVELOPE_MS)'
 * — a pure function of `ctx.nowMs`, never an accumulated per-frame
 * delta, so a stepped recorder clock replays identical fades.  The
 * envelope MULTIPLIES the producer's own `fadeAlpha` (both continuous,
 * so the product is too; a first appearance therefore stacks with the
 * producer's layer load-in fade, which reads as one smooth reveal).  A
 * disappearing label keeps flushing its remembered last emission (and
 * its remembered owned lines) until the ramp reaches 0 — the text fades
 * out rather than popping — and a reappearance mid-fade reverses from
 * the current alpha, so neither direction jumps.
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
import { smoothstep } from '../../../utils/math/smoothstep';

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

/**
 * Appear/disappear ramp duration in frame-clock ms.  Long enough to read
 * as a fade rather than a flicker, short enough that a focus handoff
 * (outgoing label ramping down while the incoming ramps up, concurrently)
 * completes within a single tour beat's attention span.
 */
const ENVELOPE_MS = 300;

/**
 * Ramp record for one label id.  `startAlpha`/`target`/`rampStartMs`
 * define the alpha as a closed-form function of the frame clock (see
 * `envelopeAlpha`); flipping direction re-bases `startAlpha` at the
 * evaluated current value so reversals are continuous.  `lastLabel` and
 * `lastOwnedLines` remember the most recent live emission so the
 * fade-out tail has something to draw after the producer stops emitting.
 */
type EnvelopeEntry = {
  startAlpha: number;
  target: 0 | 1;
  rampStartMs: number;
  lastLabel: Label;
  lastOwnedLines: MarkerLine[];
};

export function createLabelDirectorSubsystem(): LabelDirectorSubsystem {
  let labelRenderer: LabelRenderer | null = null;
  let lineRenderer: MarkerLineRenderer | null = null;
  let producers: readonly LabelProducer[] = [];
  // Signature of the last flushed (labels, lines) tuple, or null on the
  // first frame.  Empty string is a valid signature (no labels, no lines)
  // and is distinct from null.
  let prevSignature: string | null = null;
  // The director's one piece of cross-frame animation state: label id →
  // ramp record.  Everything else in the frame body is derived fresh;
  // this map is what lets a label that STOPPED being emitted keep fading.
  const envelopes = new Map<string, EnvelopeEntry>();

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
    // Cheap stable signature: per-entry `id:fadeAlpha`, joined.
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
    return `L:${labels.length}:${lIds};M:${lines.length}:${mIds}`;
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

  /**
   * Closed-form envelope alpha at the stamped frame clock.  `smoothstep`
   * clamps internally, so a settled ramp holds its endpoint exactly (the
   * fade-in lands on precisely 1, never 0.999…, which matters because the
   * `alpha === 1` fast path below passes originals through unchanged).
   */
  function envelopeAlpha(entry: EnvelopeEntry, nowMs: number): number {
    const eased = smoothstep(0, 1, (nowMs - entry.rampStartMs) / ENVELOPE_MS);
    return entry.startAlpha + (entry.target - entry.startAlpha) * eased;
  }

  /**
   * The appear/disappear stage (see module header).  Runs on the
   * DECLUTTERED sets — a label the declutter culled is "absent" here and
   * fades out exactly like one a producer stopped emitting.
   *
   * Presence drives direction: a decluttered label with no entry starts a
   * 0→1 ramp; an entry whose label went absent flips to a →0 ramp ONCE
   * (on the transition frame, re-based at the evaluated current alpha —
   * re-flipping every frame would freeze the fade at its start); an entry
   * whose →0 ramp completes is deleted.  During the fade-out tail the
   * remembered last emission is re-flushed so the glyphs fade instead of
   * popping.  Owned lines inherit their owner's envelope; declutter
   * already guarantees every surviving owned line's owner is live.
   *
   * `anyRamping` is true while any entry's ramp is incomplete — the
   * caller keeps the render loop awake so the animation actually draws
   * under render-on-demand.
   */
  function applyEnvelope(
    labels: readonly Label[],
    lines: readonly MarkerLine[],
    nowMs: number,
  ): { labels: Label[]; lines: MarkerLine[]; anyRamping: boolean } {
    const outLabels: Label[] = [];
    const outLines: MarkerLine[] = [];
    // Live label id → this frame's envelope alpha, for the lines walk.
    const liveAlpha = new Map<string, number>();

    for (const label of labels) {
      const existing = envelopes.get(label.id);
      let entry: EnvelopeEntry;
      if (!existing) {
        entry = {
          startAlpha: 0,
          target: 1,
          rampStartMs: nowMs,
          lastLabel: label,
          lastOwnedLines: [],
        };
        envelopes.set(label.id, entry);
      } else {
        entry = existing;
        if (entry.target === 0) {
          // Reappeared mid-fade-out: reverse from the evaluated current
          // alpha, not from 0 — continuity in both directions.
          entry.startAlpha = envelopeAlpha(entry, nowMs);
          entry.target = 1;
          entry.rampStartMs = nowMs;
        }
        entry.lastLabel = label;
        entry.lastOwnedLines = []; // refilled by the lines walk below
      }
      const alpha = envelopeAlpha(entry, nowMs);
      liveAlpha.set(label.id, alpha);
      // Fast path: a settled envelope is a no-op — pass the producer's
      // object through so the steady state allocates nothing.
      outLabels.push(alpha === 1 ? label : { ...label, fadeAlpha: (label.fadeAlpha ?? 1) * alpha });
    }

    for (const line of lines) {
      if (line.ownerLabelId === undefined) {
        outLines.push(line); // unowned lines bypass the envelope entirely
        continue;
      }
      const alpha = liveAlpha.get(line.ownerLabelId) ?? 1;
      envelopes.get(line.ownerLabelId)?.lastOwnedLines.push(line);
      outLines.push(alpha === 1 ? line : { ...line, fadeAlpha: (line.fadeAlpha ?? 1) * alpha });
    }

    // Absent entries: flip to fade-out on the transition frame, re-emit
    // the remembered emission while the tail lasts, drop when it hits 0.
    // (Deleting during for..of over a Map is spec-safe.)
    let anyRamping = false;
    for (const [id, entry] of envelopes) {
      if (liveAlpha.has(id)) {
        if (nowMs - entry.rampStartMs < ENVELOPE_MS) anyRamping = true;
        continue;
      }
      if (entry.target === 1) {
        const current = envelopeAlpha(entry, nowMs);
        if (current <= 0) {
          // Never became visible (e.g. appeared and vanished within one
          // clock step) — nothing to fade, just forget it.
          envelopes.delete(id);
          continue;
        }
        entry.startAlpha = current;
        entry.target = 0;
        entry.rampStartMs = nowMs;
      }
      const alpha = envelopeAlpha(entry, nowMs);
      if (alpha <= 0) {
        envelopes.delete(id);
        continue;
      }
      anyRamping = true;
      const label = entry.lastLabel;
      outLabels.push(alpha === 1 ? label : { ...label, fadeAlpha: (label.fadeAlpha ?? 1) * alpha });
      for (const line of entry.lastOwnedLines) {
        outLines.push(alpha === 1 ? line : { ...line, fadeAlpha: (line.fadeAlpha ?? 1) * alpha });
      }
    }

    return { labels: outLabels, lines: outLines, anyRamping };
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
    // declutter); the director de-collides them together here.
    const decluttered = declutter(mergedLabels, mergedLines, ctx);

    // Appear/disappear envelope over the decluttered result — animated
    // alphas feed `signatureOf` below, so mid-ramp frames re-upload and
    // settled frames skip, with no extra bookkeeping.
    const { labels, lines, anyRamping } = applyEnvelope(
      decluttered.labels,
      decluttered.lines,
      ctx.nowMs,
    );

    const sig = signatureOf(labels, lines);
    if (sig !== prevSignature) {
      labelRenderer.setLabels(labels);
      lineRenderer.setLines(lines);
      prevSignature = sig;
    }

    if (anyAwake || anyRamping) {
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
