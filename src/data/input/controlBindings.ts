import type { ControlSchemeId } from '../../@types/engine/camera/ControlSchemeId';
import type { BindingTable } from '../../@types/input/BindingTable';

/** Skymap's rule: middle / right mouse pan, everything else orbits (touch and pen never report buttons 1 / 2). */
export const CONTROL_BINDINGS: Readonly<Record<ControlSchemeId, BindingTable>> = {
  skymap: [
    [{ pointerType: 'mouse', button: 1 }, 'pan'],
    [{ pointerType: 'mouse', button: 2 }, 'pan'],
    [{}, 'orbit'],
  ],
  // Placeholder until the openspace row lands (plan Task 3).
  openspace: [
    [{ pointerType: 'mouse', button: 1 }, 'pan'],
    [{ pointerType: 'mouse', button: 2 }, 'pan'],
    [{}, 'orbit'],
  ],
};
