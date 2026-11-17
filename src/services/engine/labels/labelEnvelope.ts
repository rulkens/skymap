/**
 * labelEnvelope — eases each record's drawn alpha toward target × survivor, so neither a rule
 * nor a declutter cull pops a label, and writes the record's alpha word when it changed. Pure in
 * `nowMs` given its columns, so a stepped recorder clock replays identical fades.
 *  - smoothstepRamp (COSMO): a fixed-duration ramp of presence (goal > 0), times the target, or
 *    the last non-zero target during a fade-out; reversals re-base at the current value.
 *  - exponentialApproach (NEAR0): `alpha += (goal − alpha)(1 − e^(−dt/τ))`, snapped within
 *    `settleEps`; a new record starts at its goal, so only changes animate.
 * After a re-encode the columns follow each record's key, so a label that moved keeps its fade.
 */

import type { LabelFrame } from '../../../@types/rendering/LabelFrame';
import type { LabelRecords } from '../../../@types/rendering/LabelRecords';
import type { LabelStage } from '../../../@types/rendering/LabelStage';
import { LABEL_RECORD as W, LABEL_RECORD_WORDS } from '../../../data/labels/labelRecordLayout';
import { smoothstep } from '../../../utils/math/smoothstep';
import { markRecordsDirty } from '../../../utils/labels/markRecordsDirty';

export const labelEnvelope: LabelStage = (records, frame, { director, nowMs }) => {
  if (frame.generation !== records.generation) rekey(records, frame);
  const policy = director.envelope;
  const dtMs = frame.lastNowMs < 0 ? 0 : Math.max(0, nowMs - frame.lastNowMs);
  frame.lastNowMs = nowMs;
  let ramping = false;

  for (let i = 0; i < records.count; i++) {
    const target = frame.target[i]!;
    const goal = target * frame.survivor[i]!;
    let alpha: number;
    if (policy.mode === 'smoothstepRamp') {
      const present = goal > 0 ? 1 : 0;
      if (frame.fresh[i]) {
        frame.rampFrom[i] = 0;
        frame.rampTo[i] = 0;
        frame.rampSinceMs[i] = nowMs;
        frame.fresh[i] = 0;
      }
      const eased = smoothstep(0, 1, (nowMs - frame.rampSinceMs[i]!) / policy.durationMs);
      // A finished ramp lands exactly on its end, or it would keep the loop awake.
      const ramp =
        eased >= 1
          ? frame.rampTo[i]!
          : frame.rampFrom[i]! + (frame.rampTo[i]! - frame.rampFrom[i]!) * eased;
      if (present !== frame.rampTo[i]) {
        frame.rampFrom[i] = ramp;
        frame.rampTo[i] = present;
        frame.rampSinceMs[i] = nowMs;
      }
      if (ramp !== frame.rampTo[i]) ramping = true;
      if (present) frame.held[i] = target;
      alpha = (present ? target : frame.held[i]!) * ramp;
    } else {
      if (frame.fresh[i]) {
        frame.shown[i] = goal;
        frame.fresh[i] = 0;
      }
      const prev = frame.shown[i]!;
      let next = prev + (goal - prev) * (1 - Math.exp(-dtMs / policy.tauMs));
      if (Math.abs(next - goal) < policy.settleEps) next = goal;
      else ramping = true;
      frame.shown[i] = next;
      alpha = next;
    }
    const word = i * LABEL_RECORD_WORDS + W.alpha;
    if (records.f32[word] !== Math.fround(alpha)) {
      records.f32[word] = alpha;
      markRecordsDirty(records, i, i + 1);
    }
  }
  frame.ramping = ramping;
};

/** Moves the envelope columns to the records' new order by key; unseen keys start fresh. */
function rekey(records: LabelRecords, frame: LabelFrame): void {
  const was = new Map(frame.keys.map((key, i) => [key, i]));
  const shown = frame.shown.slice();
  const held = frame.held.slice();
  const rampFrom = frame.rampFrom.slice();
  const rampTo = frame.rampTo.slice();
  const rampSinceMs = frame.rampSinceMs.slice();
  for (let i = 0; i < records.count; i++) {
    const j = was.get(records.keys[i]!);
    frame.fresh[i] = j === undefined ? 1 : 0;
    if (j === undefined) continue;
    frame.shown[i] = shown[j]!;
    frame.held[i] = held[j]!;
    frame.rampFrom[i] = rampFrom[j]!;
    frame.rampTo[i] = rampTo[j]!;
    frame.rampSinceMs[i] = rampSinceMs[j]!;
  }
  frame.keys = records.keys.slice(0, records.count);
  frame.generation = records.generation;
}
