/**
 * How far each join of a `seq` pulls the next step back into the previous one,
 * in seconds: one number for every join, or one entry per join between steps
 * that have a duration (zero-length steps do not count). The array is mutable
 * because Immer's `Draft` of `ClipData` (cameraIntentSlice) rejects a readonly one.
 */
export type SeqOverlap = number | number[];
