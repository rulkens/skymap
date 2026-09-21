/**
 * RecorderWindow — `Window` widened with the optional `__skymapRecorder`
 * slot the cinema-mode installer writes.
 *
 * A named intersection instead of a `declare global { interface Window }`
 * augmentation: the house style bans `interface`, and a global augmentation
 * would advertise the slot to every file in the app when its only writer is
 * `installRecorderHook`, and its in-repo readers are that installer's test
 * suite and `tools/record/record.ts` (both read it through untyped
 * `page.evaluate`). Both sides cast through this one name so the shape can't
 * drift between them.
 */

import type { SkymapRecorderHook } from './SkymapRecorderHook';

export type RecorderWindow = Window & { __skymapRecorder?: SkymapRecorderHook };
