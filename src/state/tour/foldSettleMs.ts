/**
 * FOLD_SETTLE_MS — how long a WINDOWED tour run pauses after its opening
 * scene-reconstruction fold before the first beat's clip starts.
 *
 * A `--beats from..to` take with from > 0 reconstructs the skipped prefix's
 * scene cues in a single `mergeSnapshot` dispatch (see guidedTourSaga). The
 * store change is instant, but what the viewer sees is not: the visibility
 * bridge animates source fades over ~600 ms and the label-fade envelope over
 * ~300 ms, so the first frames after the fold show labels and layers
 * mid-dissolve — a transient that never existed in the full playthrough the
 * take stands in for. 1000 ms covers the longest of those bridges with
 * margin.
 *
 * Exported as a shared constant because two clocks must agree on it: the
 * guided-tour saga delays this long (in the page's own time) so the bridges
 * finish before the beat plays, and the recorder harness discards exactly
 * this much virtual time — grant-and-drop, no capture — so the film's first
 * frame opens on the settled scene rather than the reconstruction dissolve.
 */
export const FOLD_SETTLE_MS = 1000;
