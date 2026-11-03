/**
 * DragMode — which camera term a drag drives.
 *
 * Fixed when the gesture opens and never changes for its life, so the
 * recognizer and the aggregator can key runs on it.
 * `tilt` is the two-finger drag: the body rung reads it as a secondary drag,
 * and `replayInput` swallows it on every other rung.
 */

export type DragMode = 'orbit' | 'pan' | 'tilt';
