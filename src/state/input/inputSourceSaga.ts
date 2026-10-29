/**
 * inputSourceSaga — one input source's pump, the same for every source: device
 * events → `recognize` → the press bound through `CONTROL_BINDINGS` → `input/*`
 * actions. Motion and hover buffer to one dispatch per animation frame; every
 * edge (start, end, tap, resize) flushes the buffer first so the slice sees
 * events in device order. A double-tap's `focusSelected` lands after its own
 * second press's `inputGestureStarted`, so that press cannot cancel the fly.
 */

import type { EventChannel } from 'redux-saga';
import { call, put, race, select, take } from 'typed-redux-saga';

import {
  inputGestureEnded,
  inputGestureStarted,
  inputHovered,
  inputMoved,
  inputSourceAttached,
  inputSourceDetached,
  inputSourceResized,
  inputTapped,
} from './inputSlice';
import { focusSelected } from '../selection/focusSelected';
import { CONTROL_BINDINGS } from '../../data/input/controlBindings';
import { TAP_SELECTING_INTENTS } from '../../data/input/tapSelectingIntents';
import { selectCameraControls } from '../settings/selectors';
import { bindPress } from '../../utils/input/bindPress';
import { initialRecognizerState } from '../../utils/input/initialRecognizerState';
import { recognize } from '../../utils/input/recognize';
import { nextAnimationFrame } from '../../utils/browser/nextAnimationFrame';
import type { BindingTable } from '../../@types/input/BindingTable';
import type { DeviceEvent } from '../../@types/input/DeviceEvent';
import type { HeldIntent } from '../../@types/input/HeldIntent';
import type { Motion } from '../../@types/input/Motion';
import type { SourceId } from '../../@types/input/SourceId';
import type { UnitPoint } from '../../@types/input/UnitPoint';

export function* inputSourceSaga(source: SourceId, channel: EventChannel<DeviceEvent>) {
  // Latched at each press: a `shift+c` mid-gesture must not change the running gesture's intent,
  // nor the table its tap is judged by. The next press reads the new scheme.
  let bindings: BindingTable = CONTROL_BINDINGS.skymap;
  let recognizer = initialRecognizerState();
  let held: HeldIntent | null = null;
  let motion: Motion[] = [];
  let hover: { readonly at: UnitPoint | null } | null = null;
  let frame: Promise<void> | null = null;

  function* flush() {
    frame = null;
    const moved = motion;
    const hovered = hover;
    motion = [];
    hover = null;
    if (moved.length > 0) yield* put(inputMoved({ source, motion: moved }));
    if (hovered !== null) yield* put(inputHovered({ source, at: hovered.at }));
  }

  const buffer = (): void => {
    frame ??= nextAnimationFrame();
  };

  try {
    let first = yield* take(channel);
    while (first.kind !== 'resize') first = yield* take(channel);
    recognizer = recognize(recognizer, first).state;
    yield* put(inputSourceAttached({ source, aspect: first.widthPx / first.heightPx }));

    while (true) {
      const pending: Promise<void> | null = frame;
      const next = pending
        ? yield* race({ event: take(channel), frame: call(() => pending) })
        : { event: yield* take(channel) };
      if (!next.event) {
        yield* flush();
        continue;
      }
      const event = next.event;
      const step = recognize(recognizer, event);
      recognizer = step.state;
      if (event.kind === 'resize') {
        yield* flush();
        yield* put(inputSourceResized({ source, aspect: event.widthPx / event.heightPx }));
      }

      for (const g of step.gestures) {
        switch (g.kind) {
          case 'heldStart':
            bindings = CONTROL_BINDINGS[(yield* select(selectCameraControls)).scheme];
            held = bindPress(bindings, g.press);
            yield* flush();
            yield* put(inputGestureStarted({ source, intent: held }));
            break;
          case 'heldEnd':
            yield* flush();
            yield* put(inputGestureEnded({ source }));
            held = null;
            break;
          case 'drag':
            if (held === null) break;
            motion.push({ intent: held, dx: g.dx, dy: g.dy, ratio: 1, at: g.at, held: true });
            buffer();
            break;
          case 'pinch':
            motion.push({ intent: 'zoom', dx: 0, dy: 0, ratio: g.ratio, at: null, held: true });
            buffer();
            break;
          case 'wheel':
            motion.push({
              intent: 'zoom',
              dx: 0,
              dy: 0,
              ratio: g.ratio,
              at: g.at,
              held: held !== null,
            });
            buffer();
            break;
          case 'hover':
            hover = { at: g.at };
            buffer();
            break;
          case 'tap':
          case 'doubleTap':
            // Only a press bound to the selecting drag picks or focuses.
            if (!TAP_SELECTING_INTENTS.has(bindPress(bindings, g.press))) break;
            yield* flush();
            yield* put(g.kind === 'tap' ? inputTapped({ source, at: g.at }) : focusSelected());
            break;
        }
      }
    }
  } finally {
    if (held !== null) yield* put(inputGestureEnded({ source }));
    yield* put(inputSourceDetached({ source }));
    channel.close();
  }
}
