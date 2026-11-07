import type { RoomCode } from '../../../../../src/@types/remote/RoomCode';
import { newLocalRoomCode } from '../../../../../src/utils/remote/newLocalRoomCode';
import type { RelayHandle } from '../../../../../tools/@types/remote/RelayHandle';
import type { Settings } from '../settings/@types/Settings';

/**
 * Stores a new code, then moves the live room onto it (kicking `current`'s remotes with 4001).
 * Returns the new code for the caller to hand out from then on; stored first so a crash in
 * between still leaves the next launch on the new code.
 */
export function rotateRoomCode(
  settings: Settings,
  relay: RelayHandle,
  current: RoomCode,
): RoomCode {
  const next = newLocalRoomCode();
  settings.set('roomCode', next);
  relay.rotate(current, next);
  return next;
}
