/**
 * label2DDirector — owns the labelRenderer + markerLineRenderer
 * setLabels/setLines calls, polling registered Label2DProducers each frame
 * and flushing the merged result once. `createLabel2DDirector(config)` mints
 * one instance per slab (COSMO and NEAR0) — `Label2DDirectorConfig` supplies
 * the projection, declutter policy, envelope policy, and lift policy, so a
 * second instance is data, not a second code path.
 *
 * ### Declutter, envelope, and lift are policy arms
 *
 * `config.declutter.mode` / `config.envelope.mode` select which stage
 * implementation runs: `bboxOverlap`/`smoothstepRamp` (COSMO) or
 * `screenSeparation`/`exponentialApproach` (NEAR0). `config.lift`, when
 * non-null, runs a third stage after the envelope — see its own docblock
 * for why it is gated on data absence (`label.lift`) rather than a mode.
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
 * Each decluttered label id gets a ramp/filter record in the arm's own map;
 * `applySmoothstepEnvelope` (COSMO) and `applyExponentialEnvelope` (NEAR0)
 * resolve it per `config.envelope.mode` — see their docblocks for the
 * fade-out mechanics and the three axes they differ on (target shape, seed
 * value, absence rule; spec §4.6). Both are pure functions of `ctx.nowMs`
 * given their entry's state, so a stepped recorder clock replays identical
 * fades. COSMO's envelope MULTIPLIES the producer's own `fadeAlpha` (both
 * continuous, so the product is too; a first appearance therefore stacks
 * with the producer's layer load-in fade, which reads as one smooth
 * reveal).
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
import type { Label2DProjected } from '../../../@types/rendering/Label2DProjected';
import type { ScreenRectPx } from '../../../@types/rendering/ScreenRectPx';
import type { Vec2 } from '../../../@types/math/Vec2';
import { projectLabels } from '../../../utils/labels/projectLabels';
import { smoothstep } from '../../../utils/math/smoothstep';
import {
  LABEL_MIN_PX_DEFAULT,
  LABEL_MAX_PX_DEFAULT,
  LABEL_WORLD_EM_MPC_DEFAULT,
} from '../../../data/labels/labelSizingDefaults';
import { labelScreenRect } from '../../../utils/labels/labelScreenRect';
import { clampVec3Length } from '../../../utils/math/clampVec3Length';
import { liftedLabelPlacement } from '../presentation/liftedLabelPlacement';
import { FAMOUS_LABEL_STYLE } from '../presentation/famousLabelStyle';
import { declutterByScreenSeparation } from '../../../utils/scene/declutterByScreenSeparation';

/**
 * Ramp record for one label id under `smoothstepRamp` (COSMO).
 * `startAlpha`/`target`/`rampStartMs` define the alpha as a closed-form
 * function of the frame clock (see `smoothstepAlpha`); flipping direction
 * re-bases `startAlpha` at the evaluated current value so reversals are
 * continuous.  `lastLabel` (leader included) remembers the most recent live
 * emission so the fade-out tail has something to draw after the producer
 * stops emitting — see `applySmoothstepEnvelope`'s absence rule.
 */
type SmoothstepEnvelopeEntry = {
  startAlpha: number;
  target: 0 | 1;
  rampStartMs: number;
  lastLabel: Label2D;
};

/**
 * Filter state for one label id under `exponentialApproach` (NEAR0). Unlike
 * the closed-form smoothstep entry, `alpha` is the IIR filter's running
 * value and `evalMs` is when it was last advanced — evaluating twice at the
 * same `nowMs` is a no-op (`dt` is 0 the second time). No `lastLabel`: this
 * arm drops an absent id immediately rather than remembering an emission to
 * fade out — see `applyExponentialEnvelope`'s absence rule (spec §4.6).
 */
type ExponentialEnvelopeEntry = {
  alpha: number;
  evalMs: number;
};

/**
 * `declutter`'s result: the filtered survivor array (what `applySmoothstepEnvelope`
 * and the lift/flush stages consume) alongside a survivor-id set (what
 * `applyExponentialEnvelope` additionally needs — see its docblock for why
 * it must see every emitted label, not just the survivors).
 */
type DeclutterResult = {
  readonly survivors: readonly Label2D[];
  readonly survivorIds: ReadonlySet<string>;
};

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
  const viewportHeightPx = projection.viewportPx[1];
  // `labelScreenRect` is the shared CPU twin of the vertex shader's em clamp —
  // the pick path derives its hit boxes from the same function, so a label
  // cannot be decluttered against one rect and clicked on another.
  const rects: (ScreenRectPx | null)[] = labels.map((label, i) => {
    const p = projected[i]!;
    if (!p.screenPx) return null;
    const bbox = labelRenderer.measure(label);
    if (!bbox) return null;
    return labelScreenRect({
      label,
      bbox,
      screenPx: p.screenPx,
      clipW: p.clipW,
      viewportHeightPx,
    });
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

/**
 * `screenSeparation` declutter arm (NEAR0). Cheaper than `bboxOverlap` —
 * anchor-point separation rather than measured text rects, appropriate where
 * text metrics aren't the cull's business (spec §4.5). A label with no
 * `screenPx` (behind the camera) bypasses the cull unconditionally, exactly
 * as `declutterByBboxOverlap` never blocks on an off-screen anchor; the pure
 * `declutterByScreenSeparation` util does the priority-sorted greedy accept
 * over everything else. Returns a fresh array in original input order.
 */
function declutterByScreenSeparationArm(
  labels: readonly Label2D[],
  projected: readonly Label2DProjected[],
  minSeparationPx: number,
): Label2D[] {
  const candidateIdx: number[] = [];
  const candidates: { screenPx: Vec2; priorityPx: number }[] = [];
  const accepted = new Set<number>();
  for (let i = 0; i < labels.length; i++) {
    const p = projected[i]!;
    const label = labels[i]!;
    // Bypass unconditionally: behind camera (no screen position) OR a
    // zero-fadeAlpha label. Such a label has nothing to show regardless of
    // survival, so it must not CLAIM a screen slot and cull a real, visible
    // caption at the same position — it neither competes nor blocks.
    if (!p.screenPx || (label.fadeAlpha ?? 1) === 0) {
      accepted.add(i);
      continue;
    }
    candidateIdx.push(i);
    candidates.push({ screenPx: p.screenPx, priorityPx: label.prominencePx ?? 0 });
  }
  for (const k of declutterByScreenSeparation({ candidates, minSeparationPx })) {
    accepted.add(candidateIdx[k]!);
  }
  return labels.filter((_, i) => accepted.has(i));
}

export function createLabel2DDirector(config: Label2DDirectorConfig): Label2DDirector {
  let labelRenderer: LabelRenderer | null = null;
  let lineRenderer: MarkerLineRenderer | null = null;
  let producers: readonly Label2DProducer[] = [];
  // Signature of the last flushed label set, or null on the first frame.
  // Empty string is a valid signature (no labels) and is distinct from null.
  let prevSignature: string | null = null;
  // The director's cross-frame animation state: label id → ramp/filter
  // record, one map per envelope arm.  Only one is ever populated — which
  // arm runs is fixed by `config.envelope.mode` for this instance's whole
  // lifetime — but both exist so `applySmoothstepEnvelope`/
  // `applyExponentialEnvelope` stay simple typed functions rather than a
  // shared map cast per call.  Everything else in the frame body is derived
  // fresh; these maps are what let a label that STOPPED being emitted keep
  // fading (smoothstep) or drop immediately (exponential).
  const smoothstepEnvelopes = new Map<string, SmoothstepEnvelopeEntry>();
  const exponentialEnvelopes = new Map<string, ExponentialEnvelopeEntry>();

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
   *
   * Returns BOTH the filtered `survivors` array (what `smoothstepRamp`
   * consumes unchanged — a culled label is simply absent from it, exactly
   * as before) and a `survivorIds` set (what `exponentialApproach` needs:
   * it evaluates every label the producers emitted this frame, not just the
   * survivors, so a culled-but-still-emitted label eases toward 0 instead of
   * popping — see `applyExponentialEnvelope`).
   */
  function declutter(labels: readonly Label2D[], ctx: ReadyFrameContext): DeclutterResult {
    const projection = config.project(ctx);
    const projected = projectLabels(labels, projection);
    const policy = config.declutter;
    let survivors: Label2D[];
    switch (policy.mode) {
      case 'bboxOverlap':
        survivors = declutterByBboxOverlap(
          labelRenderer!,
          labels,
          projected,
          projection,
          policy.padPx,
        );
        break;
      case 'screenSeparation':
        survivors = declutterByScreenSeparationArm(labels, projected, policy.minSeparationPx);
        break;
    }
    return { survivors, survivorIds: new Set(survivors.map((l) => l.id)) };
  }

  /** Closed-form alpha at `nowMs` for a `smoothstepRamp` entry — `smoothstep` clamps internally, so a settled ramp holds its endpoint exactly (fade-in lands on precisely 1, never 0.999…, which matters for the `alpha === 1` fast path below). */
  function smoothstepAlpha(
    entry: SmoothstepEnvelopeEntry,
    nowMs: number,
    durationMs: number,
  ): number {
    const eased = smoothstep(0, 1, (nowMs - entry.rampStartMs) / durationMs);
    return entry.startAlpha + (entry.target - entry.startAlpha) * eased;
  }

  /**
   * The `smoothstepRamp` appear/disappear arm (COSMO; module header). Runs
   * on the DECLUTTERED set — a label the declutter culled is "absent" here
   * and fades out exactly like one a producer stopped emitting.
   *
   * Presence drives direction: a decluttered label with no entry starts a
   * 0→1 ramp; an entry whose label went absent flips to a →0 ramp ONCE (on
   * the transition frame, re-based at the evaluated current alpha —
   * re-flipping every frame would freeze the fade at its start); an entry
   * whose →0 ramp completes is deleted. During the fade-out tail the
   * remembered last emission — leader included — is re-flushed so the
   * glyphs (and any anchor) fade instead of popping. `anyRamping` keeps the
   * render loop awake while any ramp is incomplete.
   */
  function applySmoothstepEnvelope(
    labels: readonly Label2D[],
    nowMs: number,
    policy: { durationMs: number },
  ): { labels: Label2D[]; anyRamping: boolean } {
    const outLabels: Label2D[] = [];
    const liveIds = new Set<string>();

    for (const label of labels) {
      liveIds.add(label.id);
      const existing = smoothstepEnvelopes.get(label.id);
      let entry: SmoothstepEnvelopeEntry;
      if (!existing) {
        entry = { startAlpha: 0, target: 1, rampStartMs: nowMs, lastLabel: label };
        smoothstepEnvelopes.set(label.id, entry);
      } else {
        entry = existing;
        if (entry.target === 0) {
          // Reappeared mid-fade-out: reverse from the evaluated current
          // alpha, not from 0 — continuity in both directions.
          entry.startAlpha = smoothstepAlpha(entry, nowMs, policy.durationMs);
          entry.target = 1;
          entry.rampStartMs = nowMs;
        }
        entry.lastLabel = label;
      }
      const alpha = smoothstepAlpha(entry, nowMs, policy.durationMs);
      // Fast path: a settled envelope is a no-op — pass the producer's
      // object through so the steady state allocates nothing.
      outLabels.push(alpha === 1 ? label : { ...label, fadeAlpha: (label.fadeAlpha ?? 1) * alpha });
    }

    // Absent entries: flip to fade-out on the transition frame, re-emit
    // the remembered emission while the tail lasts, drop when it hits 0.
    // (Deleting during for..of over a Map is spec-safe.)
    let anyRamping = false;
    for (const [id, entry] of smoothstepEnvelopes) {
      if (liveIds.has(id)) {
        if (nowMs - entry.rampStartMs < policy.durationMs) anyRamping = true;
        continue;
      }
      if (entry.target === 1) {
        const current = smoothstepAlpha(entry, nowMs, policy.durationMs);
        if (current <= 0) {
          // Never became visible (e.g. appeared and vanished within one
          // clock step) — nothing to fade, just forget it.
          smoothstepEnvelopes.delete(id);
          continue;
        }
        entry.startAlpha = current;
        entry.target = 0;
        entry.rampStartMs = nowMs;
      }
      const alpha = smoothstepAlpha(entry, nowMs, policy.durationMs);
      if (alpha <= 0) {
        smoothstepEnvelopes.delete(id);
        continue;
      }
      anyRamping = true;
      const label = entry.lastLabel;
      outLabels.push(alpha === 1 ? label : { ...label, fadeAlpha: (label.fadeAlpha ?? 1) * alpha });
    }

    return { labels: outLabels, anyRamping };
  }

  /**
   * The `exponentialApproach` appear/disappear arm (NEAR0; spec §4.6).
   * Differs from `applySmoothstepEnvelope` on three axes:
   *
   *   - target: the label's own `fadeAlpha` when it SURVIVED declutter this
   *     frame (continuous — the producer's distance-band fade), 0 when
   *     declutter culled it OR when it's genuinely absent. Unlike
   *     `applySmoothstepEnvelope`, this arm therefore walks EVERY label the
   *     producers emitted this frame (`labels`, the pre-declutter merged
   *     set), not just `survivorIds`'s members — a culled label stays in the
   *     filter's universe and eases toward 0 rather than disappearing on
   *     the cull frame. Reading declutter survival straight off `labels`
   *     instead would make a culled caption pop to invisible on the cull
   *     frame and re-seed at full target the instant the cull flips back —
   *     the seed rule (below) makes THAT look like a correct fade-in, which
   *     is what makes the bug invisible in a settled frame.
   *   - seed: a new id's filter starts AT its target (0 if culled on its
   *     first frame, its fadeAlpha otherwise), so only CHANGES animate — a
   *     gate turning on paints the steady state instead of ramping every
   *     caption up from black.
   *   - absence: DROPS IMMEDIATELY, no remembered-emission tail — but only
   *     for ids the producers stopped emitting entirely (not in `labels`
   *     this frame). A merely-culled label is still in `labels`, so it
   *     keeps easing via the target-0 branch above instead of dropping.
   *
   * The filter itself is `prev + (target − prev)·(1 − exp(−dt/tau))`, with
   * `dt` read off the entry's own `evalMs` (this arm's frame clock, kept as
   * director-instance state rather than a module-level singleton — a second
   * director instance must not share it) and a settle snap at `settleEps`
   * so a finished ramp lands exactly on target instead of drifting forever.
   * The `alpha > 0` skip below is what drops a zero-target caption from the
   * flush instead of uploading an invisible row.
   */
  function applyExponentialEnvelope(
    labels: readonly Label2D[],
    survivorIds: ReadonlySet<string>,
    nowMs: number,
    policy: { tauMs: number; settleEps: number },
  ): { labels: Label2D[]; anyRamping: boolean } {
    const outLabels: Label2D[] = [];
    const liveIds = new Set<string>();
    let anyRamping = false;

    for (const label of labels) {
      liveIds.add(label.id);
      const ownAlpha = label.fadeAlpha ?? 1;
      const target = survivorIds.has(label.id) ? ownAlpha : 0;
      const existing = exponentialEnvelopes.get(label.id);
      let alpha: number;
      if (!existing) {
        // Seed AT target — only changes animate, not first appearances.
        alpha = target;
        exponentialEnvelopes.set(label.id, { alpha, evalMs: nowMs });
      } else {
        const dtMs = Math.max(0, nowMs - existing.evalMs);
        const approach = 1 - Math.exp(-dtMs / policy.tauMs);
        let next = existing.alpha + (target - existing.alpha) * approach;
        if (Math.abs(next - target) < policy.settleEps) next = target;
        else anyRamping = true;
        existing.alpha = next;
        existing.evalMs = nowMs;
        alpha = next;
      }
      if (alpha > 0) {
        outLabels.push(alpha === ownAlpha ? label : { ...label, fadeAlpha: alpha });
      }
    }

    // Absence: drop immediately (see the arm's docblock above) — an id NOT
    // in `liveIds` this frame is one its producer stopped emitting entirely,
    // as opposed to one declutter merely culled (still in `liveIds`, still
    // eased via the target-0 branch above).
    for (const id of exponentialEnvelopes.keys()) {
      if (!liveIds.has(id)) exponentialEnvelopes.delete(id);
    }

    return { labels: outLabels, anyRamping };
  }

  /**
   * `smoothstepRamp` consumes `declutterResult.survivors` — a culled label
   * is simply absent, unchanged from before this stage split. `exponentialApproach`
   * consumes the full pre-declutter `mergedLabels` plus `survivorIds` — see
   * `applyExponentialEnvelope`'s docblock for why culled-but-still-emitted
   * labels must stay in ITS universe.
   */
  function applyEnvelope(
    mergedLabels: readonly Label2D[],
    declutterResult: DeclutterResult,
    nowMs: number,
  ): { labels: Label2D[]; anyRamping: boolean } {
    const policy = config.envelope;
    switch (policy.mode) {
      case 'smoothstepRamp':
        return applySmoothstepEnvelope(declutterResult.survivors, nowMs, policy);
      case 'exponentialApproach':
        return applyExponentialEnvelope(mergedLabels, declutterResult.survivorIds, nowMs, policy);
    }
  }

  /**
   * The lift stage (spec §4.4). Runs after the envelope, over survivors
   * only, and only when `config.lift` is non-null. A label without a `lift`
   * field skips the lift by ABSENCE OF DATA — never a `kind` test — so e.g.
   * constellation captions (which anchor in empty space and have no subject
   * to float above) simply never carry one.
   */
  function applyLift(labels: readonly Label2D[], ctx: ReadyFrameContext): readonly Label2D[] {
    const policy = config.lift;
    if (!policy) return labels;
    const slab = ctx.slabs[policy.slab];
    if (!slab) throw new Error(`label2DDirector: no slab at index ${policy.slab}`);
    const projection = config.project(ctx); // memoised per ctx — free here
    const renderer = labelRenderer!;

    const out: Label2D[] = [];
    for (const label of labels) {
      const lift = label.lift;
      if (!lift) {
        out.push(label);
        continue;
      }

      // Pull the anchor inside the slab's far plane before the lift — the
      // ill-conditioned-inverse guard: `liftedLabelPlacement` INVERTS the
      // projection, and at deep zoom a NEAR0 anchor many orders of
      // magnitude beyond a near-floored far plane makes `ndc_z` round to
      // 1.0 within f64 error while the inverse's huge depth-row elements
      // amplify the residual — the caption and both leader endpoints then
      // hop every frame the camera moves. In the camera-relative frame (eye
      // at the origin) a uniform length scale moves clip x/y/w together, so
      // the screen position is IDENTICAL and only depth slides into the
      // well-conditioned interior.
      const anchor = label.worldPos;
      const liftAnchor = clampVec3Length(anchor, slab.farMpc * policy.farClampFraction);

      // Obligatory companion to the clamp: the label shader sizes glyphs as
      // `pxPerEm = worldEmMpc / clip.w`, so a PHYSICAL em at the clamped
      // depth inflates by exactly the clamp ratio — scaling the em by the
      // same ratio (read off the clamp's OUTPUT, never re-derived) restores
      // `em / clip.w` to the true-depth value. `clampVec3Length` returns its
      // input by reference when in range, making the near-body case an
      // exact no-op instead of a hypot round-off away from 1.
      const anchorScale =
        liftAnchor === anchor
          ? 1
          : Math.hypot(liftAnchor[0], liftAnchor[1], liftAnchor[2]) /
            Math.hypot(anchor[0], anchor[1], anchor[2]);
      const liftEmMpc = (label.worldEmMpc ?? LABEL_WORLD_EM_MPC_DEFAULT) * anchorScale;

      const placement = liftedLabelPlacement({
        anchorWorldPos: liftAnchor,
        vp: projection.vp,
        viewportPx: projection.viewportPx,
        subjectSizePx: lift.subjectSizePx,
        textBbox: renderer.measure(label),
        worldEmMpc: liftEmMpc,
        minPixelSize: label.minPixelSize ?? LABEL_MIN_PX_DEFAULT,
        maxPixelSize: label.maxPixelSize ?? LABEL_MAX_PX_DEFAULT,
        lineBottomLiftPx: lift.lineBottomLiftPx ?? 0,
      });

      if (placement === null) {
        // Behind the camera: no projection to lift from. Emitted unlifted
        // at the raw (unclamped) anchor, matching DEMAND rather than which
        // side of the camera plane the anchor happens to sit on this frame;
        // no connector, since there is no geometry.
        out.push({ ...label, worldPos: anchor, leader: undefined });
        continue;
      }

      out.push({
        ...label,
        worldPos: placement.labelWorldPos,
        worldEmMpc: liftEmMpc,
        leader:
          placement.line === null
            ? undefined
            : {
                fromWorld: placement.line.fromWorld,
                toWorld: placement.line.toWorld,
                pixelWidth: FAMOUS_LABEL_STYLE.pixelWidth,
                color: label.color ?? [1, 1, 1, 1],
              },
      });
    }
    return out;
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
    const declutterResult = declutter(mergedLabels, ctx);

    // Appear/disappear envelope — animated alphas feed `signatureOf` below,
    // so mid-ramp frames re-upload and settled frames skip, with no extra
    // bookkeeping. Passed the FULL merged set alongside the declutter
    // result (not just the survivors) — `applyEnvelope`'s docblock explains
    // why the exponential arm needs both.
    const { labels: enveloped, anyRamping } = applyEnvelope(
      mergedLabels,
      declutterResult,
      ctx.nowMs,
    );

    // Lift stage (NEAR0 only — a no-op array pass-through when
    // `config.lift` is null): runs over survivors only, after the envelope
    // has resolved the final alpha for each.
    const labels = applyLift(enveloped, ctx);

    // Flush contract: one MarkerLine per surviving leader-carrying label,
    // derived from the FINAL (post-declutter, post-envelope, post-lift) set.
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
