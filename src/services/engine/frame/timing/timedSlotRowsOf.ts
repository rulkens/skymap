/**
 * timedSlotRowsOf — the single walk every timing projection shares: the ordered
 * slot list (`timedSlotsOf`), the grouped lists (`timedSlotGroupsOf` /
 * `groupPassNames`) and the name→groupKey map (`PASS_GROUP_KEYS`) are each a
 * projection of this one derivation, so a slot's group can't drift from its
 * position in the row order — a new pass joins them all at once.
 */

import type { FrameStep } from '../../../../@types/engine/frame/FrameStep';
import type { TimedSlotRow } from '../../../../@types/engine/frame/TimedSlotRow';
import { groupKeyOf, passTimingSlotName, renderStepTimingSlotName } from '../slabs';

export function timedSlotRowsOf(program: readonly FrameStep[]): readonly TimedSlotRow[] {
  const rows: TimedSlotRow[] = [];
  for (const step of program) {
    if (step.kind === 'render') {
      // Every pass this step draws shares the step's `(target, slab)`, so one
      // groupKey covers the whole run. The key comes from the shared
      // `groupKeyOf` helper (slabs.ts) — the same definition the executor
      // resolves against, so the two can't drift.
      const groupKey = groupKeyOf(step.target, step.slab);
      for (const contentPass of step.passes) {
        // `passTimingSlotName` carries the body row and the capture face into
        // the slot NAME, so two body rows sharing one pass (Jupiter + a moon,
        // both drawn by `planetsPass`) — or one roster pass drawn once per
        // captured face and once for the real view — each get their own
        // query-set slot instead of colliding on the same two indices (see its
        // doc, slabs.ts).
        rows.push({
          name: passTimingSlotName(contentPass.name, step.slab, step.face),
          groupKey,
        });
      }
      // One extra slot per render STEP named for the groupKey itself, so the
      // `merged` executor — one pass for the whole group — has a slot to attach
      // `timestampWrites` to; the per-pass slots are the `perLayerTimed` shape's
      // alone. Pushed AFTER the pass loop so the total trails its passes.
      // `groupKey` alone is NOT unique across steps — all 6 capture faces share
      // `('sky-cubemap', NEAR0)`, and several `FRAME_ORDER` lines share
      // `(hdr, NEAR0)` — so `renderStepTimingSlotName` appends the face or the
      // line's authored `slot`. The DebugPanel still buckets on the bare
      // `groupKey`, so those all land under one title each.
      rows.push({ name: renderStepTimingSlotName(groupKey, step.face, step.slot), groupKey });
    } else if (step.kind === 'composite') {
      // A composite merges whole textures rather than projecting geometry — it
      // belongs to no slab, and all composites share the one infra group.
      rows.push({ name: `${step.step.source}→${step.step.dest}`, groupKey: 'composite' });
    } else if (step.kind === 'bloom') {
      // The bloom sub-pipeline bills one slot spanning its whole pass sequence
      // (see runBloom) — the same name the fold + bright passes write the shared
      // query pair under.
      rows.push({ name: 'bloom', groupKey: 'bloom' });
    }
    // 'compute' steps contribute no timing slot.
  }
  // Pick is a parallel program over the whole registry (both slabs).
  rows.push({ name: 'pick', groupKey: 'pick' });
  return rows;
}
