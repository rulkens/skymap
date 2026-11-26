import type { TakeoverSource } from '../takeover/TakeoverSource';

/** The takeover kinds a link can open. Sky mode has no id, so no hash names it (D13). */
export type LinkTakeoverKind = Exclude<TakeoverSource['kind'], 'sky'>;
