/** A local room code: 40 random bits as 8 Crockford base32 characters (no I, L, O, U). */
import { ROOM_CODE_LENGTH } from '../../data/remote/roomCodeLength';
import type { RoomCode } from '../../@types/remote/RoomCode';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newLocalRoomCode(
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): RoomCode {
  const bytes = random(new Uint8Array(ROOM_CODE_LENGTH));
  // 256 is a multiple of 32, so the modulo adds no bias.
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}
