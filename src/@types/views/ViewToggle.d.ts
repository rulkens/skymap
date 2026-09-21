/**
 * ViewToggle — the one control a `View`'s Key section may carry. Its arms are
 * plain-action LISTS rather than a settings patch, so a view can flip anything
 * the store accepts; `runTakeover`'s snapshot restores whatever they wrote.
 */

import type { UnknownAction } from '@reduxjs/toolkit';

export type ViewToggle = {
  label: string;
  /** Reads after the label as "· <word>". */
  onWord: string;
  offWord: string;
  on: readonly UnknownAction[];
  off: readonly UnknownAction[];
};
