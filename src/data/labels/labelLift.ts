/**
 * `LabelData.lift` (`labels/io.wesl`): whether a label lifts off its subject and
 * where its leader starts. The WGSL constants of the same names must match;
 * `labelData.parity` holds them equal.
 */
export const LABEL_LIFT = { none: 0, leaderFromCentre: 1, leaderFromRim: 2 } as const;
