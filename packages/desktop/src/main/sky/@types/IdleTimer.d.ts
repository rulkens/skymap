/** createIdleTimer's handle: `poke` on activity, `stop` when the watched thing goes away. */
export type IdleTimer = { poke: () => void; stop: () => void };
