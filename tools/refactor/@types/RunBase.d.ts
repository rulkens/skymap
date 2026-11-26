import type { RunInput } from './RunInput';

/** What the driver knows before the engine query: a run minus its address and its found refs. */
export type RunBase = Omit<RunInput<unknown, unknown>, 'address' | 'found'>;
