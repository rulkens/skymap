import { Source } from '../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';

/** Shared by the disk's selection row, label and emphasis, so they cannot drift. */
export const MILKY_WAY_PICK_ID = packSelection(Source.MilkyWay, 0 + PICK_SENTINEL_OFFSET);
