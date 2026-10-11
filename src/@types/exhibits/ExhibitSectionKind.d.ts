/**
 * ExhibitSectionKind — what one kind of exhibit notes section does: its Component draws the
 * section's `data`, and an optional `hold` takes over the exhibit's hold (at most one section of
 * an exhibit carries one). `id` names the kind for React keys and must be unique across kinds.
 */

import type { ComponentType } from 'react';

import type { Exhibit } from './Exhibit';
import type { Transition } from '../navigation/Transition';

export type ExhibitSectionKind<D> = {
  readonly id: string;
  readonly Component: ComponentType<{ readonly data: D }>;
  hold?(exhibit: Exhibit, data: D, entry: Transition, atLinkedTime: boolean): Generator;
};
