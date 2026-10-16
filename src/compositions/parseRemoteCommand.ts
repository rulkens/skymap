/**
 * parseRemoteCommand — `{ name, payload }` with a registry name and a payload
 * its row's `parse` accepts; null otherwise. Passed to `parseRemoteMessage` as
 * its `parseCommand`.
 */

import { REMOTE_COMMANDS } from './remoteCommands';
import { isKeyOf } from '../utils/object/isKeyOf';
import { isRecord } from '../utils/object/isRecord';
import type { RemoteCommand } from '../@types/remote/RemoteCommand';

export function parseRemoteCommand(raw: unknown): RemoteCommand | null {
  if (!isRecord(raw) || typeof raw.name !== 'string') return null;
  if (!isKeyOf(REMOTE_COMMANDS, raw.name)) return null;
  const name = raw.name;
  const payload = REMOTE_COMMANDS[name].parse(raw.payload);
  // TypeScript cannot correlate `name` with its row's payload type across the union.
  return payload === undefined ? null : ({ name, payload } as RemoteCommand);
}
