/**
 * label2DDirector — owns the labelRenderer + markerLineRenderer
 * setLabels/setLines calls, polling registered Label2DProducers each frame
 * and flushing the merged result once. `createLabel2DDirector(config)` mints
 * one instance per slab (COSMO today; NEAR0 once its arms land) —
 * `Label2DDirectorConfig` supplies the projection, declutter policy, and
 * envelope policy, so a second instance is data, not a second code path.
 *
 * ### Declutter and envelope are policy arms
 *
 * `config.declutter.mode` / `config.envelope.mode` select which stage
 * implementation runs. Only `bboxOverlap` and `smoothstepRamp` (COSMO's
 * arms) are implemented; `screenSeparation` and `exponentialApproach`
 * throw until NEAR0's arms land.
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
 * `runFrame` returns `true` when any producer reports `awake: true`, or any
 * appear/disappear envelope (below) is mid-ramp — the caller folds this vote
 * into `shouldKeepTicking`. The director never wakes the loop itself.
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
 * Each decluttered label id gets a ramp record; `envelopeAlpha` (below)
 * resolves it per `config.envelope.mode` — COSMO's `smoothstepRamp` is
 * 'startAlpha + (target − startAlpha) · smoothstep(elapsed/durationMs)'
 * — a pure function of `ctx.nowMs`, never an accumulated per-frame
 * delta, so a stepped recorder clock replays identical fades.  The
 * envelope MULTIPLIES the producer's own `fadeAlpha` (both continuous,
 * so the product is too; a first appearance therefore stacks with the
 * producer's layer load-in fade, which reads as one smooth reveal).  A
 * disappearing label keeps flushing its remembered last emission —
 * leader included, since the leader now lives on the label — until the
 * ramp reaches 0 — the text fades out rather than popping — and a
 * reappearance mid-fade reverses from the current alpha, so neither
 * direction jumps.
 *
 * ### Leader lines are synthesized, not carried
 *
 * A `Label2D` may carry an optional `leader` (`Label2DLeader`) instead of
 * producers emitting a sibling `MarkerLine[]`: since every anchor line is
 * 1:1 owned by exactly one label, folding it onto the label makes that
 * ownership structural rather than a string back-reference. `runFrame`
 * synthesizes one `MarkerLine` per surviving leader-carrying label AFTER
 * declutter and the envelope have resolved the final label set, so a
 * culled or faded-out label's leader disappears with it by construction —
 * no separate line-side bookkeeping needed.
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
 * existing pattern at point-of-use in `filamentsLayer`.
 */

import type { LabelRenderer } from '../../../@types/rendering/LabelRenderer';
import type { Label2D } from '../../../@types/rendering/Label2D';
import type { MarkerLineRenderer } from '../../../@types/rendering/MarkerLineRenderer';
import type { MarkerLine } from '../../../@types/rendering/MarkerLine';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { Label2DProducer } from '../../../@types/engine/subsystems/Label2DProducer';
import type { Label2DDirector } from '../../../@types/engine/subsystems/Label2DDirector';
import type { Label2DDirectorConfig } from '../../../@types/engine/subsystems/Label2DDirectorConfig';
import type { Label2DProjection } from '../../../@types/rendering/Label2DProjection';
import type { Vec2 } from '../../../@types/math/Vec2';
import { smoothstep } from '../../../utils/math/smoothstep';
import { ATLAS_FONT_SIZE } from '../../../data/fonts';
import {
  LABEL_MIN_PX_DEFAULT,
  LABEL_MAX_PX_DEFAULT,
  LABEL_WORLD_EM_MPC_DEFAULT,
} from '../../gpu/renderers/labels/labelRenderer';

/**
 * Ramp record for one label id.  `startAlpha`/`target`/`rampStartMs`
 * define the alpha as a closed-form function of the frame clock (see
 * `envelopeAlpha`); flipping direction re-bases `startAlpha` at the
 * evaluated current value so reversals are continuous.  `lastLabel`
 * (leader included) remembers the most recent live emission so the
 * fade-out tail has something to draw after the producer stops emitting.
 */
type EnvelopeEntry = {
  startAlpha: number;
  target: 0 | 1;
  rampStartMs: number;
  lastLabel: Label2D;
};

/**
 * One label's screen-space anchor, resolved ONCE per frame by `projectLabels`
 * and shared by whichever declutter arm runs (and, later, the lift stage) —
 * nothing downstream re-does the matrix multiply. `screenPx` is set whenever
 * `clipW > 0` regardless of `onScreen`, matching what the vertex shader would
 * draw for an off-NDC-range anchor.
 */
type Label2DProjected = {
  readonly screenPx: Vec2 | null;
  readonly clipW: number;
  readonly onScreen: boolean;
};

function projectLabels(
  labels: readonly Label2D[],
  projection: Label2DProjection,
): Label2DProjected[] {
  const m = projection.vp;
  const [viewportW, viewportH] = projection.viewportPx;
  return labels.map((label) => {
    // Column-major mat4·vec4 by hand — the lib's vec4.transformMat4
    // allocates per call.
    const wx = label.worldPos[0];
    const wy = label.worldPos[1];
    const wz = label.worldPos[2];
    const clipX = m[0]! * wx + m[4]! * wy + m[8]! * wz + m[12]!;
    const clipY = m[1]! * wx + m[5]! * wy + m[9]! * wz + m[13]!;
    const clipW = m[3]! * wx + m[7]! * wy + m[11]! * wz + m[15]!;
    if (clipW <= 0) return { screenPx: null, clipW, onScreen: false };
    const ndcX = clipX / clipW;
    const ndcY = clipY / clipW;
    const screenX = (ndcX * 0.5 + 0.5) * viewportW;
    // Flip Y: NDC +Y is up, screen +Y is down.
    const screenY = (1 - (ndcY * 0.5 + 0.5)) * viewportH;
    const onScreen = ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1;
    return { screenPx: [screenX, screenY], clipW, onScreen };
  });
}

/**
 * `prominencePx` DESC, stable on input order — the one rank contract every
 * declutter arm shares, whichever collision test it runs.  A label with no
 * prominence sinks to lowest priority rather than beating real structures.
 * (Labels that must always win — the Milky Way "You are here" — declare it
 * explicitly with `prominencePx: Number.MAX_VALUE` in their producer.)
 */
function sortByProminenceDesc(labels: readonly Label2D[]): number[] {
  const order = labels.map((_, i) => i);
  order.sort((a, b) => {
    const d = (labels[b]!.prominencePx ?? 0) - (labels[a]!.prominencePx ?? 0);
    return d !== 0 ? d : a - b;
  });
  return order;
}

/**
 * `bboxOverlap` declutter arm (COSMO). Reads each label's shared `clipW` to
 * reproduce the vertex shader's em clamp on the CPU, places the measured
 * text rect (`labelRenderer.measure` — real glyph ink, alignment shifts
 * applied), and accepts a label in rank order when its padded rect
 * intersects no already-accepted rect.  Two labels collide when their padded
 * rects INTERSECT — a label merely anchored near another (e.g. just below a
 * baseline-aligned label whose text extends upward) does not collide, while
 * wide labels whose anchors are far apart but whose texts overlap do.
 * Off-screen labels (behind camera / outside the viewport) are accepted
 * unconditionally and never block, as are labels whose text lays out to no
 * ink.  A culled label's leader is culled with it BY CONSTRUCTION — the
 * leader lives on the label object, so there is no separate line-side filter
 * to run.  Returns a fresh array in original input order (deterministic,
 * sort-independent).
 */
function declutterByBboxOverlap(
  labelRenderer: LabelRenderer,
  labels: readonly Label2D[],
  projected: readonly Label2DProjected[],
  projection: Label2DProjection,
  padPx: number,
): Label2D[] {
  type Rect = { x0: number; y0: number; x1: number; y1: number };
  const halfViewportH = projection.viewportPx[1] * 0.5;
  const rects: (Rect | null)[] = labels.map((label, i) => {
    const p = projected[i]!;
    if (!p.screenPx) return null;
    const bbox = labelRenderer.measure(label);
    if (!bbox) return null;
    // Reproduce the vertex shader's sizing exactly: worldLenToPx
    // (worldLen / clipW · viewportH/2) clamped to [minPx, maxPx], then
    // atlas px → screen px via displayEmPx / ATLAS_FONT_SIZE. The bbox is
    // anchor-relative with +Y down, matching screen space (the shader's
    // atlas-Y and NDC→screen flips cancel).
    const pxPerEm = ((label.worldEmMpc ?? LABEL_WORLD_EM_MPC_DEFAULT) / p.clipW) * halfViewportH;
    const displayEmPx = Math.min(
      Math.max(pxPerEm, label.minPixelSize ?? LABEL_MIN_PX_DEFAULT),
      label.maxPixelSize ?? LABEL_MAX_PX_DEFAULT,
    );
    const s = displayEmPx / ATLAS_FONT_SIZE;
    return {
      x0: p.screenPx[0] + bbox.minX * s,
      y0: p.screenPx[1] + bbox.minY * s,
      x1: p.screenPx[0] + bbox.maxX * s,
      y1: p.screenPx[1] + bbox.maxY * s,
    };
  });

  const order = sortByProminenceDesc(labels);
  const accepted: number[] = [];
  for (const i of order) {
    const rect = rects[i];
    if (projected[i]!.onScreen && rect) {
      let collides = false;
      for (const a of accepted) {
        const aRect = rects[a]!;
        if (!projected[a]!.onScreen || !aRect) continue;
        if (
          rect.x0 - padPx < aRect.x1 &&
          rect.x1 + padPx > aRect.x0 &&
          rect.y0 - padPx < aRect.y1 &&
          rect.y1 + padPx > aRect.y0
        ) {
          collides = true;
          break;
        }
      }
      if (collides) continue;
    }
    accepted.push(i);
  }

  const acceptedIndices = new Set(accepted);
  return labels.filter((_, i) => acceptedIndices.has(i));
}

export function createLabel2DDirector(config: Label2DDirectorConfig): Label2DDirector {
  let labelRenderer: LabelRenderer | null = null;
  let lineRenderer: MarkerLineRenderer | null = null;
  let producers: readonly Label2DProducer[] = [];
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

  function registerProducer(producer: Label2DProducer): void {
    // Copy-on-write append — keeps the producers array immutable from
    // any caller's perspective.
    producers = [...producers, producer];
  }

  function signatureOf(labels: readonly Label2D[]): string {
    // Cheap stable signature: per-label `id:fadeAlpha:worldPos[:leaderToWorld]`,
    // joined. A label's synthesized leader line (see `synthesizeLines`) carries
    // no state of its own beyond what's keyed here, so one term covers both.
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
    // `worldPos` is included because labels are placed by a screen-space
    // lift (`liftedLabelPlacement`): a lifted label's anchor is
    // camera-derived and moves every frame the camera does, while its `id`
    // and `fadeAlpha` stay constant.  Without this term the anchor would
    // freeze at whatever world point was uploaded the first visible frame,
    // and that fixed point would reproject and DRIFT over the glyphs as the
    // camera orbits.  A moving leader would mask the gap — its `toWorld` is
    // in the signature too, so a moved leader already forces a re-flush of
    // the whole set — but the lift SUPPRESSES the leader when its height ≤ 0,
    // and then nothing else keys the label's motion.  Keying the label's own
    // position closes that gap: a camera-derived label re-uploads on its
    // own, independent of whether its leader is present.  The glyph layout
    // in `labelRenderer.setLabels` is cheap and label counts are tiny, so
    // the per-orbit-frame re-upload this implies is the intended cost;
    // static-position producers (structures) keep their positions stable
    // and still benefit from the skip.  Colours are still excluded — no
    // producer varies a label's colour at fixed id.
    //
    // `leader.toWorld`, when present, is included for the same
    // camera-derived reason: the leader lines (famous-galaxy connectors,
    // the Milky Way stem) lift in screen space and un-project
    // (`labelLeaderLine`), so their tips move with the camera while the
    // owning label's id and fadeAlpha stay constant — without this term a
    // connector would freeze at whatever geometry was uploaded the first
    // visible frame.  Endpoints only move while the camera does, so the
    // skip still fires on every static frame — exactly when it pays.
    //
    // Edge case: a producer mutating a label's `text` while keeping
    // the same `id` will NOT trigger re-upload.  No current producer
    // does this — the Milky Way label has constant text; structures derive text
    // from the structure name which is part of the id space.
    const lIds = labels
      .map((l) => {
        const leaderKey = l.leader
          ? `:${l.leader.toWorld[0]},${l.leader.toWorld[1]},${l.leader.toWorld[2]}`
          : '';
        return `${l.id}:${l.fadeAlpha ?? 1}:${l.worldPos[0]},${l.worldPos[1]},${l.worldPos[2]}${leaderKey}`;
      })
      .join('|');
    return `L:${labels.length}:${lIds}`;
  }

  /**
   * One `MarkerLine` per label carrying a `leader`, synthesized from the
   * FINAL (post-declutter, post-envelope) label set — the flush contract in
   * the module header. `id` is `` `${label.id}-anchor` ``; `fadeAlpha` is
   * the label's own resolved alpha, so the connector fades in lock-step with
   * its label with no separate multiplication to keep in sync.
   */
  function synthesizeLines(labels: readonly Label2D[]): MarkerLine[] {
    const lines: MarkerLine[] = [];
    for (const label of labels) {
      const leader = label.leader;
      if (!leader) continue;
      lines.push({
        id: `${label.id}-anchor`,
        fromWorld: leader.fromWorld,
        toWorld: leader.toWorld,
        pixelWidth: leader.pixelWidth,
        color: leader.color,
        fadeAlpha: label.fadeAlpha ?? 1,
      });
    }
    return lines;
  }

  /**
   * Cross-producer declutter over the merged label set: resolves this
   * frame's projection (memoised per `ctx` by `config.project`), projects
   * every label's anchor ONCE (`projectLabels`), then hands the shared
   * per-label records to whichever declutter arm `config.declutter.mode`
   * selects. Runs in the director (not per producer) so it de-collides
   * labels ACROSS producers — a structure label vs a famous-galaxy label
   * vs the Milky Way "you are here" marker — which a per-producer pass
   * could never see.
   */
  function declutter(labels: readonly Label2D[], ctx: ReadyFrameContext): Label2D[] {
    const projection = config.project(ctx);
    const projected = projectLabels(labels, projection);
    const policy = config.declutter;
    switch (policy.mode) {
      case 'bboxOverlap':
        return declutterByBboxOverlap(labelRenderer!, labels, projected, projection, policy.padPx);
      case 'screenSeparation':
        throw new Error('unimplemented');
    }
  }

  /**
   * Envelope alpha at the stamped frame clock, per `config.envelope.mode`.
   * `smoothstepRamp` (COSMO) is closed-form: `smoothstep` clamps internally,
   * so a settled ramp holds its endpoint exactly (the fade-in lands on
   * precisely 1, never 0.999…, which matters because the `alpha === 1` fast
   * path below passes originals through unchanged).
   */
  function envelopeAlpha(entry: EnvelopeEntry, nowMs: number): number {
    const policy = config.envelope;
    switch (policy.mode) {
      case 'smoothstepRamp': {
        const eased = smoothstep(0, 1, (nowMs - entry.rampStartMs) / policy.durationMs);
        return entry.startAlpha + (entry.target - entry.startAlpha) * eased;
      }
      case 'exponentialApproach':
        throw new Error('unimplemented');
    }
  }

  /** Whether a still-live entry's ramp has more distance to close — `envelopeAlpha`'s duration test, per arm. */
  function isEnvelopeRamping(entry: EnvelopeEntry, nowMs: number): boolean {
    const policy = config.envelope;
    switch (policy.mode) {
      case 'smoothstepRamp':
        return nowMs - entry.rampStartMs < policy.durationMs;
      case 'exponentialApproach':
        throw new Error('unimplemented');
    }
  }

  /**
   * The appear/disappear stage (see module header). Runs on the
   * DECLUTTERED sets — a label the declutter culled is "absent" here and
   * fades out exactly like one a producer stopped emitting.
   *
   * Presence drives direction: a decluttered label with no entry starts a
   * 0→1 ramp; an entry whose label went absent flips to a →0 ramp ONCE
   * (on the transition frame, re-based at the evaluated current alpha —
   * re-flipping every frame would freeze the fade at its start); an entry
   * whose →0 ramp completes is deleted.  During the fade-out tail the
   * remembered last emission — leader included — is re-flushed so the
   * glyphs (and any anchor) fade instead of popping.
   *
   * `anyRamping` is true while any entry's ramp is incomplete — the
   * caller keeps the render loop awake so the animation actually draws
   * under render-on-demand.
   */
  function applyEnvelope(
    labels: readonly Label2D[],
    nowMs: number,
  ): { labels: Label2D[]; anyRamping: boolean } {
    const outLabels: Label2D[] = [];
    const liveIds = new Set<string>();

    for (const label of labels) {
      liveIds.add(label.id);
      const existing = envelopes.get(label.id);
      let entry: EnvelopeEntry;
      if (!existing) {
        entry = { startAlpha: 0, target: 1, rampStartMs: nowMs, lastLabel: label };
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
      }
      const alpha = envelopeAlpha(entry, nowMs);
      // Fast path: a settled envelope is a no-op — pass the producer's
      // object through so the steady state allocates nothing.
      outLabels.push(alpha === 1 ? label : { ...label, fadeAlpha: (label.fadeAlpha ?? 1) * alpha });
    }

    // Absent entries: flip to fade-out on the transition frame, re-emit
    // the remembered emission while the tail lasts, drop when it hits 0.
    // (Deleting during for..of over a Map is spec-safe.)
    let anyRamping = false;
    for (const [id, entry] of envelopes) {
      if (liveIds.has(id)) {
        if (isEnvelopeRamping(entry, nowMs)) anyRamping = true;
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
    }

    return { labels: outLabels, anyRamping };
  }

  function runFrame(state: EngineState, ctx: ReadyFrameContext): boolean {
    if (!labelRenderer || !lineRenderer) return false;

    // Collect outputs.  Producers are pure of state, so we just call
    // each and concatenate.  The director does NOT cache per-producer
    // output between frames — change detection happens on the merged
    // array via signature.
    const mergedLabels: Label2D[] = [];
    let anyAwake = false;
    for (const p of producers) {
      const out = p.produceLabels(state, ctx);
      for (const l of out.labels) mergedLabels.push(l);
      if (out.awake) anyAwake = true;
    }

    // Cross-producer declutter — producers emit every candidate (no internal
    // declutter); the director de-collides them together here. A culled
    // label's leader is culled with it by construction.
    const decluttered = declutter(mergedLabels, ctx);

    // Appear/disappear envelope over the decluttered result — animated
    // alphas feed `signatureOf` below, so mid-ramp frames re-upload and
    // settled frames skip, with no extra bookkeeping.
    const { labels, anyRamping } = applyEnvelope(decluttered, ctx.nowMs);

    // Flush contract: one MarkerLine per surviving leader-carrying label,
    // derived from the FINAL (post-declutter, post-envelope) set.
    const lines = synthesizeLines(labels);

    const sig = signatureOf(labels);
    if (sig !== prevSignature) {
      labelRenderer.setLabels(labels);
      lineRenderer.setLines(lines);
      prevSignature = sig;
    }

    return anyAwake || anyRamping;
  }

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the label director is one of
  // the engine's ~13 teardown targets, and the shared shape lets
  // engine.destroy() iterate uniformly across the bag.
  const director: Label2DDirector = {
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
