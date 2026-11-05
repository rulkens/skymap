import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';

/** Shared by the disk's selection row, label and emphasis, so they cannot drift. */
export function milkyWayPickId(pickCode: number): number {
  return packSelection(pickCode, 0 + PICK_SENTINEL_OFFSET);
}
