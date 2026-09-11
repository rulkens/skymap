import type { SelectionRef } from './SelectionRef';

/**
 * HomeFocusTarget — the home value seeded into the focus slot by an
 * `EngineHomeConfig`. Restricted to the body arm: home is always an
 * `ORBITAL_ELEMENTS` row the follow driver can track (see `followedBodyHome`).
 * The follow driver tracks the body, so seeding it as focus plants no camera tween.
 */
export type HomeFocusTarget = {
  readonly ref: Extract<SelectionRef, { readonly type: 'body' }>;
};
