import type { RungKind } from './RungKind';

/** Rungs with a parent to climb to — every rung but the world arm itself. */
export type ClimbableKind = Exclude<RungKind, 'absolute'>;
