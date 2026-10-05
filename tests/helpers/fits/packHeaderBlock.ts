import { BLOCK_SIZE, CARD_SIZE } from './fitsBlockSizes';

/** Pack a list of pre-formatted 80-char cards into an END-terminated, block-padded header. */
export function packHeaderBlock(cards: string[]): Uint8Array {
  const text = [...cards, 'END'.padEnd(CARD_SIZE, ' ')].join('');
  const blocks = Math.ceil(text.length / BLOCK_SIZE);
  return new TextEncoder().encode(text.padEnd(blocks * BLOCK_SIZE, ' '));
}
