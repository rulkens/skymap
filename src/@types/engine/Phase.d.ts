import type { EngineState } from './state/EngineState';
import type { BootstrapDeps } from './BootstrapDeps';

/**
 * Shared phase signature.  Every phase reads from + writes to `state`
 * and may consume any of the closure-captured locals threaded through
 * `deps`.  Phases run in declared order via `runBootstrapPhases`; they
 * never call each other directly.
 */
export type Phase = (state: EngineState, deps: BootstrapDeps) => Promise<void>;
