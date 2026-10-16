import { Source } from '../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';

/** The singleton disk's packed pick word: its selection row, label and emphasis all read this
 * one value, so the subject's identity and the focus encoding cannot drift. */
export const MILKY_WAY_PICK_ID = packSelection(Source.MilkyWay, 0 + PICK_SENTINEL_OFFSET);
