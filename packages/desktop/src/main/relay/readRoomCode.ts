import type { RoomCode } from '../../../../../src/@types/remote/RoomCode';
import { ROOM_CODE_LENGTH } from '../../../../../src/data/remote/roomCodeLength';
import { newLocalRoomCode } from '../../../../../src/utils/remote/newLocalRoomCode';
import type { Settings } from '../settings/@types/Settings';

/** The stored room code; a new one from newLocalRoomCode() is stored on first read. */
export function readRoomCode(settings: Settings): RoomCode {
  const stored = settings.get('roomCode');
  if (typeof stored === 'string' && stored.length === ROOM_CODE_LENGTH) return stored;
  const code = newLocalRoomCode();
  settings.set('roomCode', code);
  return code;
}
