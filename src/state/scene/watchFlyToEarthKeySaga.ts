/**
 * watchFlyToEarthKeySaga — the fly-to-Earth debug key: pressing 'e' tweens the
 * camera down to Earth-surface framing.
 *
 * ### Why a tween, not a clip (and no new effect method)
 *
 * The fly-to is a single from→to camera move with a duration — exactly
 * `CameraTweenDescriptor`'s shape — so it reuses the focus-tween seam:
 * `put(startCameraTween(...))`, the same dispatch `watchFocusTweenSaga` makes.
 * A clip (`startClip`) is the heavier Layer-1 animation seam (timeline, player,
 * clock ownership), and a bespoke engine effect method would add a second
 * imperative camera entry point for something the existing reactive path
 * already expresses. The descriptor is assembled exactly as
 * `focusTweenDescriptor` assembles a focus tween: yaw/pitch carry over from the
 * live from-pose (the descent preserves the user's orientation), only
 * target/distance change — supplied by the pure `earthSurfaceFraming` — with
 * the shared `FOCUS_TWEEN_MS` duration and `easeOutCubic` curve, so the descent
 * animates like every other camera commitment.
 *
 * ### Why always-on, unlike the tour keys
 *
 * `watchTourKeyboardSaga` brackets its bindings to the tour window because it
 * hijacks Space/arrows — shared browser gestures whose synchronous
 * `preventDefault` (see `createKeyboardListener`) would break scrolling and
 * button activation outside a tour. A single letter 'e' carries no browser
 * default worth preserving (and `hotkeys-js` already guards form fields), so
 * the channel binds once at saga start and stays open — no lifecycle
 * bracketing to get wrong.
 *
 * ### Why it bails
 *
 * Mirrors `watchFocusTweenSaga`'s null-runtime bail: `cameraRuntime()` is null
 * pre-bootstrap / post-destroy, and `earthBody()` is null until the scene-body
 * seed installs Earth — in either window a keypress simply does nothing rather
 * than tweening from a stale pose or toward a body that isn't there.
 * getContext is read INSIDE the loop (per keypress), like the sibling sagas,
 * because the engine registers its saga context AFTER the root saga forks.
 */
import { call, take, getContext, put } from 'typed-redux-saga';

import { createKeyboardListener } from '../../services/input/createKeyboardListener';
import { startCameraTween } from '../camera/cameraSlice';
import { earthSurfaceFraming } from '../../utils/camera/earthSurfaceFraming';
import { deriveBodyStates } from '../../services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../data/time/constJ2000';
import { FOCUS_TWEEN_MS } from '../../services/engine/camera/focusTweenDuration';
import type { SagaContext } from '../../store/types';

export function* watchFlyToEarthKeySaga() {
  const channel = yield* call(createKeyboardListener, 'e');
  while (true) {
    yield* take(channel);

    const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
    const earthBody = yield* getContext<SagaContext['earthBody']>('earthBody');

    const runtime = cameraRuntime();
    if (runtime === null) continue;

    const earth = earthBody();
    if (earth === null) continue;

    // Framing position comes from the clock derive (frozen at J2000 here), not
    // the baked seed, so the fly-to lands where Earth IS once a clock can move
    // the bodies; radius is authored identity, read straight off the body. The
    // core-feature task repoints CONST_J2000 to the live sim instant.
    const earthPositionMpc = deriveBodyStates(CONST_J2000).get('earth')!.positionMpc;

    yield* put(
      startCameraTween({
        from: runtime.from,
        to: {
          yaw: runtime.from.yaw,
          pitch: runtime.from.pitch,
          ...earthSurfaceFraming(earthPositionMpc, earth.radiusKm),
        },
        durationMs: FOCUS_TWEEN_MS,
        easing: 'easeOutCubic',
      }),
    );
  }
}
