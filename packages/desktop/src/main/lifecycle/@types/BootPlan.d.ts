/** A launch's first moves: whether a person is asked in, and whether the sky loads now or after a sync. */
export type BootPlan = { showControl: boolean; start: 'load' | 'sync' };
