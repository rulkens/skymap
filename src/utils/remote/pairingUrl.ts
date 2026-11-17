import type { RoomCode } from '../../@types/remote/RoomCode';

/** The address a phone opens to join `code`; the only client code that spells the remote page's path. */
export function pairingUrl(origin: string, code: RoomCode): string {
  return `${origin}/remote.html#${code}`;
}
