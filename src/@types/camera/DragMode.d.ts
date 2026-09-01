/**
 * DragMode — which camera term a single-pointer drag drives.
 *
 * Fixed at pointerdown by button/pointer type and never changes for the life
 * of a gesture, so the recognizer and the aggregator can key runs on it.
 */

export type DragMode = 'orbit' | 'pan';
