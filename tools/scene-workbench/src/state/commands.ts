import { createAction } from '@reduxjs/toolkit';

/** Bare one-shot commands a saga watches for — never token counters in state. */
export const reloadRegistryRequested = createAction(
  'scene-workbench/commands/reloadRegistryRequested',
);
