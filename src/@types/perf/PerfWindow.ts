/**
 * PerfWindow — `Window` widened with the optional `__skymapPerf` slot the perf
 * harness installer writes.
 *
 * A named intersection instead of a `declare global { interface Window }`
 * augmentation: the house style bans `interface`, and a global augmentation
 * would advertise the slot to every file in the app when its only writer is the
 * perf-hook installer, and its in-repo readers are that installer's test suite
 * and the harness's untyped `page.evaluate`. Both sides cast through this one
 * name so the shape can't drift between them.
 */

import type { SkymapPerfHook } from './SkymapPerfHook';

export type PerfWindow = Window & { __skymapPerf?: SkymapPerfHook };
