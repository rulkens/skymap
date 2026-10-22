/**
 * parseRemoteMessage — the dome's inbound parser: text off the relay becomes a
 * `RemoteMessage`, or null, and null drops it. The command arm is validated by
 * the caller's `parseCommand` (the registry's), so `utils/` never imports a
 * composition value and the returned command is honestly typed.
 */

import { isRecord } from '../object/isRecord';
import { parseDeviceEvent } from './parseDeviceEvent';
import { MAX_SEARCH_QUERY_CHARS } from '../../data/remote/maxSearchQueryChars';
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
  switch (raw.kind) {
    case 'hello':
      return { from, kind: 'hello' };
    case 'device': {
      const event = parseDeviceEvent(raw.event);
      return event ? { from, kind: 'device', event } : null;
    }
    case 'search': {
      const { requestId, query } = raw;
      if (!isId(requestId) || typeof query !== 'string') return null;
      return { from, kind: 'search', requestId, query: query.slice(0, MAX_SEARCH_QUERY_CHARS) };
    }
    case 'command': {
      const command = parseCommand(raw.command);
      return command ? { from, kind: 'command', command } : null;
    }
    default:
      return null;
  }
}
