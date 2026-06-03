/**
 * labelsSlice — label toggle default + its setter.
 *
 * Labels off by default (the clean view); `setLabelsEnabled` replaces the
 * boolean immutably.
 */
import type { LabelsSlice } from '../../../@types/state/slices/LabelsSlice';

export const defaultLabelsSlice: LabelsSlice = { enabled: false };

export function setLabelsEnabled(prev: LabelsSlice, enabled: boolean): LabelsSlice {
  return { ...prev, enabled };
}
