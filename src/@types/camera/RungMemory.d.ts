import type { MemOf } from './MemOf';
import type { RungKind } from './RungKind';

/** The runtime's rung-local memory, wiped whenever `key` (a `frameKey`) changes. */
export type RungMemory = { readonly key: string; readonly value: MemOf[RungKind] };
