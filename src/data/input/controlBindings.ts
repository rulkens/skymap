import type { ControlSchemeId } from '../../@types/engine/camera/ControlSchemeId';
import type { BindingTable } from '../../@types/input/BindingTable';

/** One ordered table per scheme. Skymap: middle / right mouse pan, everything else orbits (touch and pen never report buttons 1 / 2). */
export const CONTROL_BINDINGS: Readonly<Record<ControlSchemeId, BindingTable>> = {
  skymap: [
    [{ pointerType: 'mouse', button: 1 }, 'pan'],
    [{ pointerType: 'mouse', button: 2 }, 'pan'],
    [{}, 'orbit'],
  ],
  // OpenSpace's mapping; touch and pen fall through to orbit, and a second finger pinches in the recognizer.
  openspace: [
    [{ pointerType: 'mouse', button: 2 }, 'navZoom'],
    [{ pointerType: 'mouse', button: 1 }, 'navRoll'],
    [{ pointerType: 'mouse', alt: true }, 'navZoom'],
    [{ pointerType: 'mouse', shift: true }, 'navRoll'],
    [{ pointerType: 'mouse', ctrl: true }, 'navLook'],
    [{}, 'navOrbit'],
  ],
};
