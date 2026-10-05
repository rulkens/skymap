/**
 * SkymapWindow — `Window` widened with the optional `__skymap` slot the base
 * hook installer writes. A named intersection, not a global `interface Window`
 * augmentation, for the same reason as `PerfWindow`.
 */

import type { SkymapHook } from './SkymapHook';

export type SkymapWindow = Window & { __skymap?: SkymapHook };
