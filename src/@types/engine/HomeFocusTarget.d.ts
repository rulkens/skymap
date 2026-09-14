import type { SelectionRef } from './SelectionRef';

/**
 * HomeFocusTarget — the home value seeded into the focus slot by an
 * `EngineHomeConfig`. Restricted to the body arm: home is always a body the
 * sim clock moves, so the follow driver can track it (see `followedBodyHome`).
 * The follow driver tracks the body, so seeding it as focus plants no camera tween.
 */
export type HomeFocusTarget = {
  readonly ref: Extract<SelectionRef, { readonly type: 'body' }>;
};
