/**
 * ExhibitToggle — the one control an `Exhibit`'s Key section may carry. Its
 * arms are plain-action LISTS rather than a settings patch, so an exhibit can
 * flip anything the store accepts; `runTakeoverSaga`'s snapshot restores whatever
 * they wrote.
 */

import type { UnknownAction } from '@reduxjs/toolkit';

export type ExhibitToggle = {
  label: string;
  /** Reads after the label as "· <word>". */
  onWord: string;
  offWord: string;
  on: readonly UnknownAction[];
  off: readonly UnknownAction[];
};
