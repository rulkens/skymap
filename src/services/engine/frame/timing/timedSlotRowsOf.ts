/**
 * timedSlotRowsOf — the one walk every timing projection shares, so a slot's
 * group can't drift from its position in the row order.
 */

import type { FrameStep } from '../../../../@types/engine/frame/FrameStep';
import type { TimedSlotRow } from '../../../../@types/engine/frame/TimedSlotRow';
import { groupKeyOf, passTimingSlotName, renderStepTimingSlotName } from '../slabs';
import { captureTimingSlotName } from './captureTimingSlotName';
import { computeTimingSlotName } from './computeTimingSlotName';

export function timedSlotRowsOf(program: readonly FrameStep[]): readonly TimedSlotRow[] {
  const rows: TimedSlotRow[] = [];
  const captureSlotsSeen = new Set<string>();
  for (const step of program) {
    if (step.kind === 'render') {
      // `groupKeyOf` is the executor's own definition (slabs.ts) — shared so the two can't drift.
      const groupKey = groupKeyOf(step);
      if (step.capture !== undefined) {
        // A capture's steps are contiguous, so one begin..end span bills the whole bake.
        const name = captureTimingSlotName(step.capture.key);
        if (!captureSlotsSeen.has(name)) {
          captureSlotsSeen.add(name);
          rows.push({ name, groupKey });
        }
        continue;
      }
      // The walk hardcodes `'canvas'`: a multi-view rig's extra views have no allocated slot yet
      // (the dome PR adds them).
      const viewId = 'canvas';
      for (const contentPass of step.passes) {
        // The row rides in the slot NAME so two body rows sharing one pass don't collide — see
        // passTimingSlotName (slabs.ts).
        rows.push({
          name: passTimingSlotName(contentPass.name, step.slab, viewId),
          groupKey,
        });
      }
      // One slot per render STEP, named for the groupKey, so the `merged` executor has something
      // to hang `timestampWrites` on; the per-pass slots are `perLayerTimed`'s alone. AFTER the
      // pass loop, so the total trails its passes. `groupKey` alone is NOT unique — several lines
      // share `(hdr, NEAR0)` — hence the authored `slot` suffix.
      rows.push({
        name: renderStepTimingSlotName(groupKey, viewId, step.slot),
        groupKey,
      });
    } else if (step.kind === 'compute') {
      // The prelude dispatches are real GPU work AHEAD of the frame's first
      // render pass, so leaving them untimed is worse than leaving them slow:
      // on a tile-based GPU an untimed dispatch drains into the next timed
      // pass's end-of-pass timestamp and reads there as that pass regressing.
      // 'canvas': mono's only rig view runs every compute step today, perView
      // or not — a dome rig gets one dispatch, and one slot, per its own view.
      rows.push({ name: computeTimingSlotName(step.name, 'canvas'), groupKey: 'compute' });
    } else if (step.kind === 'composite') {
      rows.push({ name: `${step.step.source}→${step.step.dest}`, groupKey: 'composite' });
    } else if (step.kind === 'bloom') {
      rows.push({ name: 'bloom', groupKey: 'bloom' });
    }
  }
  // Pick is a parallel program over the whole registry (both slabs).
  rows.push({ name: 'pick', groupKey: 'pick' });
  return rows;
}
