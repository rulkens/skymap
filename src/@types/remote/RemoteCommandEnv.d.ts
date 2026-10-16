import type { ToggleRow } from '../settings/ToggleRow';

/** What a command row reads from the dome when it builds its actions: the dome's clock, never the wire's. */
export type RemoteCommandEnv = { nowMs: number; toggleRows: readonly ToggleRow[] };
