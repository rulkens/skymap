/**
 * DragMode — which camera term a drag drives.
 *
 * Fixed when the gesture opens and never changes for its life, so the
 * recognizer and the aggregator can key runs on it.
 * `tilt` is the two-finger drag: the body arm reads it as a secondary drag,
 * and `replayInput` swallows it on every other arm.
 */

export type DragMode = 'orbit' | 'pan' | 'tilt';
