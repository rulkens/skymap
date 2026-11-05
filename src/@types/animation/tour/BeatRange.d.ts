/**
 * BeatRange — a contiguous window of beats within a tour, as zero-based
 * indices, inclusive on both ends (`from === to` is a single-beat take).
 *
 * A named type rather than an inline `{ from; to }` literal because two
 * independent surfaces must agree on it: the recorder hook's `startTour`
 * payload (where the harness's `--beats 4..6` flag lands) and the guided-tour
 * saga's beat loop (which clamps its iteration to the window). Naming the
 * shape once keeps those two ends from drifting into different field names
 * or inclusivity conventions.
 */
export type BeatRange = { readonly from: number; readonly to: number };
