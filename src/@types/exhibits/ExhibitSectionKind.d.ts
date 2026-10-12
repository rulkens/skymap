/**
 * ExhibitSectionKind — what one kind of exhibit notes section does: its Component draws the
 * section's `data`; an optional `hold` takes over the exhibit's hold (at most one section of an
 * exhibit carries one); `shortcuts` run ahead of the global table while the exhibit is up;
 * `cameraDriver` is a camera row core turns on while the exhibit runs.
 */

import type { ComponentType } from 'react';

import type { ExhibitCameraDriver } from '../engine/camera/ExhibitCameraDriver';
import type { KeyboardShortcut } from '../state/input/KeyboardShortcut';
import type { Transition } from '../navigation/Transition';

export type ExhibitSectionKind<D> = {
  readonly Component: ComponentType<{ readonly data: D }>;
  hold?(data: D, entry: Transition, atLinkedTime: boolean): Generator;
  readonly shortcuts?: readonly KeyboardShortcut<D>[];
  // `any` Own: the row's private memory is opaque to everything but its own `pose`.
  readonly cameraDriver?: ExhibitCameraDriver<D, any>;
};
