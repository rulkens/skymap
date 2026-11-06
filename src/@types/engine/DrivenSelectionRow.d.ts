import type { DriverGeometry } from './camera/DriverGeometry';
import type { SelectionRowBase } from './selection/SelectionRowBase';

/** A row whose kind hosts the camera; its Layer's `extractRow` fills `driver` (`selectionDriver`). */
export type DrivenSelectionRow = SelectionRowBase & { readonly driver: DriverGeometry };
