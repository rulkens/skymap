/**
 * parseRemoteMessage — the dome's inbound parser: text off the relay becomes a
 * `RemoteMessage`, or null, and null drops it. The command arm is validated by
 * the caller's `parseCommand` (the registry's), so `utils/` never imports a
 * composition value and the returned command is honestly typed. A `hello` passes
 * at any version: answering it is how a phone of another version learns the
 * dome's. Anything else must be this build's version, so it can never steer.
 */

import { isRecord } from '../object/isRecord';
import { parseDeviceEvent } from './parseDeviceEvent';
import { MAX_SEARCH_QUERY_CHARS } from '../../data/remote/maxSearchQueryChars';
import { REMOTE_PROTOCOL_VERSION } from '../../data/remote/remoteProtocolVersion';
import type { RemoteCommand } from '../../@types/remote/RemoteCommand';
import type { RemoteMessage } from '../../@types/remote/RemoteMessage';

const MAX_ID_CHARS = 64;

const isId = (raw: unknown): raw is string =>
  typeof raw === 'string' && raw.length >= 1 && raw.length <= MAX_ID_CHARS;

export function parseRemoteMessage(
  text: string,
  parseCommand: (raw: unknown) => RemoteCommand | null,
): RemoteMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || !isId(raw.from)) return null;
  const from = raw.from;
  const v = raw.v ?? 1;
  if (typeof v !== 'number') return null;
  if (raw.kind === 'hello') return { v, from, kind: 'hello' };
  if (v !== REMOTE_PROTOCOL_VERSION) return null;
  switch (raw.kind) {
    case 'device': {
      const event = parseDeviceEvent(raw.event);
      return event ? { v, from, kind: 'device', event } : null;
    }
    case 'search': {
      const { requestId, query } = raw;
      if (!isId(requestId) || typeof query !== 'string') return null;
      const cut = query.slice(0, MAX_SEARCH_QUERY_CHARS);
      return { v, from, kind: 'search', requestId, query: cut };
    }
    case 'command': {
      const command = parseCommand(raw.command);
      return command ? { v, from, kind: 'command', command } : null;
    }
    default:
      return null;
  }
}
