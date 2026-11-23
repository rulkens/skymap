import { packPickWord } from '../../../../data/selectionEncoding';

/** Shared by the disk's selection row, label and emphasis, so they cannot drift. */
export function milkyWayPickId(pickCode: number): number {
  return packPickWord(pickCode, 0);
}
