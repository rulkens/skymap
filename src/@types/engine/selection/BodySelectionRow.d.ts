import type { BodyInfo } from '../BodyInfo';
import type { DriverGeometry } from '../camera/DriverGeometry';
import type { PlacedRow } from './PlacedRow';

/** A scene body's row (`bodyRowAt`); core because craft, Earth scenes and the home pose build it too. */
export type BodySelectionRow = BodyInfo & { readonly driver: DriverGeometry } & PlacedRow;
