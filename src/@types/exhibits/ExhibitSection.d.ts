/**
 * ExhibitSection — one block of an `Exhibit`'s on-scene notes: a kind and the data it draws.
 * The pairing is type-checked once, where `section()` builds it; past that the data is opaque.
 */

import type { ExhibitSectionKind } from './ExhibitSectionKind';

export type ExhibitSection = {
  // `any`: a kind is contravariant in its data, so no narrower parameter admits every kind.
  readonly kind: ExhibitSectionKind<any>;
  readonly data: unknown;
};
