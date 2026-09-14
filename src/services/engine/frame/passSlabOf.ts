/**
 * passSlabOf — pass name → the slab it projects through, read off the frame
 * order. The pick program groups by slab but walks no `FrameStep[]` of its own
 * (see `pickProgram`'s header), so this is where the two agree on what a pass's
 * slab is. `'body'` is the widening both apply: one step per body-m row.
 */

import type { FrameStepSpec } from '../../../@types/engine/frame/FrameStepSpec';
import { NEAR0 } from './slabs';

export function passSlabOf(order: readonly FrameStepSpec[]): ReadonlyMap<string, number | 'body'> {
  const slabs = new Map<string, number | 'body'>();
  for (const spec of order) {
    // A capture line contributes nothing: it RE-draws passes another line
    // already draws, through a cube face rather than a slab (`checkFrameOrder`).
    if (spec.kind === 'render') {
      for (const name of spec.passes) slabs.set(name, spec.slab);
    } else if (spec.kind === 'foreground') {
      for (const name of spec.near0Passes) slabs.set(name, NEAR0);
      for (const name of spec.bodyPasses) slabs.set(name, 'body');
    } else if (spec.kind === 'lens') {
      for (const name of spec.passes) slabs.set(name, 'body');
    }
  }
  return slabs;
}
