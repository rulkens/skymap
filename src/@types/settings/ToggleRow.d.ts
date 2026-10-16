import type { UnknownAction } from '@reduxjs/toolkit';

/**
 * ToggleRow — one Labels & Guides checkbox as data: its current value and the action that sets it. React-free,
 * so a caller without a component tree reads and flips the same rows the settings panel renders.
 */
export type ToggleRow = {
  /** Checkbox element id, as `SectionRow.id`. */
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly set: (enabled: boolean) => UnknownAction;
};
