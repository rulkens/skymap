import type { DriverGeometry } from './camera/DriverGeometry';
import type { SelectionRow } from './SelectionRow';

/**
 * The sub-union of `SelectionRow` restricted to arms that host the camera —
 * `selectionDriver` is the one place that needs this filter spelled out.
 */
export type DrivenSelectionRow = Extract<SelectionRow, { driver: DriverGeometry }>;
