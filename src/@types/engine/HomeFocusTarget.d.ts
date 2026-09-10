import type { SelectionRef } from './SelectionRef';

/**
 * HomeFocusTarget — the home value seeded into the focus slot by an
 * `EngineHomeConfig`. Restricted to the body arm: home is always an
 * `ORBITAL_ELEMENTS` row the follow driver can track (see `followedBodyHome`).
 */
export type HomeFocusTarget = {
  readonly ref: Extract<SelectionRef, { readonly type: 'body' }>;
  /**
   * The follow driver tracks this body, so seeding it as focus plants no camera
   * tween (`watchFocusTweenSaga` returns on `bodyMovesThisFrame`). Only
   * `followedBodyHome` mints the flag; it is not dispatched into the store.
   */
  readonly followsSimClock: true;
};
