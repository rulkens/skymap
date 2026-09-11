/**
 * plainPassGroupKeys — plain `contentPass.name` → groupKey, a SEPARATE walk
 * from `timedSlotRowsOf`, because the engine handle's `allNames` (what
 * `groupPassNames` actually receives) is `CONTENT_PASSES.map(l => l.name)`: one
 * entry per REGISTERED layer, never per-body-row (toggling a layer disables it
 * on every row it draws — see `RenderTogglesSection`'s one-way override doc).
 * A `slab: 'body'` layer's plain name therefore matches every body-row step
 * here; later occurrences simply overwrite earlier ones in the built map, which
 * is harmless — `PASS_GROUP_TITLES` maps every `<target>·BODY[k]` groupKey to
 * the SAME title, so whichever row the last occurrence lands on resolves to the
 * identical display group.
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
