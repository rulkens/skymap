/**
 * ExhibitSectionKind — what one kind of exhibit notes section does: its Component draws the
 * section's `data`; an optional `hold` takes over the exhibit's hold (at most one section of an
 * exhibit carries one); `shortcuts` run ahead of the global table while the exhibit is up;
 * `cameraDriver` is a camera row core turns on while the exhibit runs. `id` names the kind for
 * React keys and must be unique across kinds.
 */

import type { ComponentType } from 'react';

import type { Exhibit } from './Exhibit';
import type { ExhibitCameraDriver } from '../engine/camera/ExhibitCameraDriver';
import type { KeyboardShortcut } from '../state/input/KeyboardShortcut';
import type { Transition } from '../navigation/Transition';

export type ExhibitSectionKind<D> = {
  readonly id: string;
  readonly Component: ComponentType<{ readonly data: D }>;
  hold?(exhibit: Exhibit, data: D, entry: Transition, atLinkedTime: boolean): Generator;
  readonly shortcuts?: readonly KeyboardShortcut<D>[];
  // `any` Own: the row's private memory is opaque to everything but its own `pose`.
  readonly cameraDriver?: ExhibitCameraDriver<D, any>;
};
