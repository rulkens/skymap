/**
 * computeTimingSlotName — a compute step's GPU-timing slot AND DebugPanel
 * toggle key, which are one string by design: `executeFrame` reads the toggle
 * under the same name it bills.
 *
 * The `-compute` suffix is not decoration. A compute step's name is free to
 * collide with a content pass's — `'flow'` is both the particle integrator and
 * the ribbon that draws its output — and an undecorated key would make
 * `buildTimingSlotMap` throw on the duplicate, and one toggle silently disable
 * both. `viewId` rides on top of that (`timingSlotForView`'s rule), so a
 * perView compute — `aerial-perspective` — claims one slot per view rather
 * than one shared name every view's dispatch would overwrite.
 */

import { timingSlotForView } from '../../../../utils/frame/timingSlotForView';

export function computeTimingSlotName(stepName: string, viewId: string): string {
  return timingSlotForView(`${stepName}-compute`, viewId);
}
