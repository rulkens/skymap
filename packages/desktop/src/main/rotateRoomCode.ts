import { join } from 'node:path';
import type { RoomCode } from '../../../../src/@types/remote/RoomCode.js';
import { newLocalRoomCode } from '../../../../src/utils/remote/newLocalRoomCode.js';
import type { RelayHandle } from '../../../../tools/@types/remote/RelayHandle.js';
import { ROOM_CODE_FILE } from '../data/roomCodeFile.js';
import { writeFileAtomically } from '../utils/writeFileAtomically.js';

/**
 * Stores a new code, then moves the live room onto it (kicking `current`'s remotes with 4001).
 * Returns the new code for the caller to hand out from then on; stored first so a crash in
 * between still leaves the next launch on the new code.
 */
export async function rotateRoomCode(
  userData: string,
  relay: RelayHandle,
  current: RoomCode,
): Promise<RoomCode> {
  const next = newLocalRoomCode();
  await writeFileAtomically(join(userData, ROOM_CODE_FILE), JSON.stringify(next));
  relay.rotate(current, next);
  return next;
}
