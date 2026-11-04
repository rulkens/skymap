/** When the mirror syncs: at every launch, daily at a local `HH:MM`, or only on "Update now". */
export type DataUpdates = { kind: 'atLaunch' } | { kind: 'daily'; at: string } | { kind: 'manual' };
