import { CARD_SIZE } from './fitsBlockSizes';

/** Format one fixed-format FITS card: `KEYWORD = value`, padded/truncated to 80 chars. */
export function fitsCard(keyword: string, rawValue: string): string {
  return `${keyword.padEnd(8)}= ${rawValue}`.padEnd(CARD_SIZE, ' ').slice(0, CARD_SIZE);
}
