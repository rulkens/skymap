import type { UnknownAction } from '@reduxjs/toolkit';

/**
 * ToggleRow — one switch as data: its current value and the actions that set it. React-free, so a
 * caller without a component tree reads and flips the same rows the settings panel renders. The
 * Labels & Guides rows and the remote's Layers rows are both this shape.
 */
export type ToggleRow = {
  /** Unique among its rows; a Labels & Guides row's is its checkbox element id, as `SectionRow.id`. */
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  /** One action for a single switch; one per item for a Layer whose items have no section switch. */
  readonly set: (enabled: boolean) => readonly UnknownAction[];
};
