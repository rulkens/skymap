import { join } from 'node:path';
import type { RoomCode } from '../../../../../src/@types/remote/RoomCode';
import { ROOM_CODE_LENGTH } from '../../../../../src/data/remote/roomCodeLength';
import { newLocalRoomCode } from '../../../../../src/utils/remote/newLocalRoomCode';
import { ROOM_CODE_FILE } from './data/roomCodeFile';
import { readJsonFile } from '../files/utils/readJsonFile';
import { writeFileAtomically } from '../files/utils/writeFileAtomically';

/** <userData>/remote-room.json; created with newLocalRoomCode() on first read. */
export async function readRoomCode(userData: string): Promise<RoomCode> {
  const path = join(userData, ROOM_CODE_FILE);
  const stored = await readJsonFile<unknown>(path);
  if (typeof stored === 'string' && stored.length === ROOM_CODE_LENGTH) return stored;
  const code = newLocalRoomCode();
  await writeFileAtomically(path, JSON.stringify(code));
  return code;
}
