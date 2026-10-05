import type { UnknownAction } from '@reduxjs/toolkit';
import type { RootState } from '../../../store/types';

/**
 * LayerSettingsRow — one data row a Layer contributes to a shared settings
 * section (the `labelsAndGuides` slot). Data, not a component: the section
 * that renders it turns each row into its own `SectionRow`.
 */
export type LayerSettingsRow = {
  /** Checkbox element id, as `SectionRow.id`. */
  readonly id: string;
  readonly label: string;
  readonly select: (state: RootState) => boolean;
  readonly set: (enabled: boolean) => UnknownAction;
};
