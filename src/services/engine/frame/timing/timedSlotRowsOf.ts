/**
 * timedSlotRowsOf — the one walk every timing projection shares, so a slot's
 * group can't drift from its position in the row order.
 */

import type { FrameStep } from '../../../../@types/engine/frame/FrameStep';
import type { TimedSlotRow } from '../../../../@types/engine/frame/TimedSlotRow';
import { groupKeyOf, passTimingSlotName, renderStepTimingSlotName } from '../slabs';

export function timedSlotRowsOf(program: readonly FrameStep[]): readonly TimedSlotRow[] {
  const rows: TimedSlotRow[] = [];
  for (const step of program) {
    if (step.kind === 'render') {
      // `groupKeyOf` is the executor's own definition (slabs.ts) — shared so the two can't drift.
      const groupKey = groupKeyOf(step.target, step.slab);
      for (const contentPass of step.passes) {
        // Row + face ride in the slot NAME so two body rows sharing one pass, or a roster pass
        // drawn per capture face, don't collide — see passTimingSlotName (slabs.ts).
        rows.push({
          name: passTimingSlotName(contentPass.name, step.slab, step.face),
          groupKey,
        });
      }
      // One slot per render STEP, named for the groupKey, so the `merged` executor has something
      // to hang `timestampWrites` on; the per-pass slots are `perLayerTimed`'s alone. AFTER the
      // pass loop, so the total trails its passes. `groupKey` alone is NOT unique — the 6 capture
      // faces share `('sky-cubemap', NEAR0)`, several lines `(hdr, NEAR0)` — hence the suffix.
      rows.push({ name: renderStepTimingSlotName(groupKey, step.face, step.slot), groupKey });
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
