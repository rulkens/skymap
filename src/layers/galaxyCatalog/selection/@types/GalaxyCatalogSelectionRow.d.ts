import type { GalaxyRow } from '../../records/@types/GalaxyRow';
import type { PlacedRow } from '../../../../@types/engine/selection/PlacedRow';

/** The small serializable galaxy row; its kind's `toFocusable` builds the `GalaxyInfo` React-side. */
export type GalaxyCatalogSelectionRow = GalaxyRow & PlacedRow;
