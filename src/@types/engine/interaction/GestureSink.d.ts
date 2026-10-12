/**
 * GestureSink — the one mouth every input gesture enters the engine through.
 *
 * The DOM recognizer emits into it; any other gesture source pushes the same
 * `InputGestureEvent`s and gets the same store edges, queueing and render wake.
 * Built once by `createGestureSink`.
 */

import type { InputGestureEvent } from '../../camera/InputGestureEvent';

export type GestureSink = (event: InputGestureEvent) => void;
