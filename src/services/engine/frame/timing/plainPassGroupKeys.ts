/**
 * plainPassGroupKeys — plain `contentPass.name` → groupKey, a walk SEPARATE
 * from `timedSlotRowsOf` because `groupPassNames` receives the engine handle's
 * `allNames` = `CONTENT_PASSES.map(l => l.name)`: one entry per REGISTERED
 * layer, never per-body-row (a toggle disables the layer on every row it
 * draws — see `RenderTogglesSection`). A `slab: 'body'` pass's name thus
 * matches every body-row step here; the last occurrence wins, harmlessly —
 * `PASS_GROUP_TITLES` gives every `<target>·BODY[k]` key the same title.
 */

import type { FrameStep } from '../../../../@types/engine/frame/FrameStep';
import { groupKeyOf } from '../slabs';

export function plainPassGroupKeys(program: readonly FrameStep[]): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const step of program) {
    if (step.kind !== 'render') continue;
    const groupKey = groupKeyOf(step.target, step.slab);
    for (const contentPass of step.passes) map.set(contentPass.name, groupKey);
  }
  return map;
}
