import { describe, expect, it } from 'vitest';

import { parseRemoteMessage } from '../../../src/utils/remote/parseRemoteMessage';
import type { RemoteCommand } from '../../../src/@types/remote/RemoteCommand';

const home: RemoteCommand = { name: 'home', payload: null };
type ParseCommand = (raw: unknown) => RemoteCommand | null;
const acceptAll: ParseCommand = () => home;
const rejectAll: ParseCommand = () => null;
const parse = (msg: unknown, parseCommand = acceptAll) =>
  parseRemoteMessage(JSON.stringify(msg), parseCommand);

describe('parseRemoteMessage', () => {
  it('drops non-JSON text', () => {
    expect(parseRemoteMessage('{"from":', acceptAll)).toBeNull();
  });

  it('drops JSON that is not an object', () => {
    expect(parse([{ from: 'a', kind: 'hello' }])).toBeNull();
    expect(parse('hello')).toBeNull();
    expect(parse(null)).toBeNull();
  });

  it('drops a message with no from', () => {
    expect(parse({ kind: 'hello' })).toBeNull();
    expect(parse({ from: '', kind: 'hello' })).toBeNull();
    expect(parse({ from: 'x'.repeat(65), kind: 'hello' })).toBeNull();
  });

  it('drops an unknown kind', () => {
    expect(parse({ from: 'a', kind: 'status' })).toBeNull();
  });

  it('cuts a search query to 64 characters', () => {
    const msg = parse({ from: 'a', kind: 'search', requestId: 'r1', query: 'x'.repeat(100) });
    expect(msg).toEqual({ from: 'a', kind: 'search', requestId: 'r1', query: 'x'.repeat(64) });
  });

  it('a command the parseCommand stub rejects drops the message', () => {
    expect(parse({ from: 'a', kind: 'command', command: home }, acceptAll)).toEqual({
      from: 'a',
      kind: 'command',
      command: home,
    });
    expect(parse({ from: 'a', kind: 'command', command: home }, rejectAll)).toBeNull();
  });

  it('a device message with a bad event drops', () => {
    expect(parse({ from: 'a', kind: 'device', event: { kind: 'leave', t: 'soon' } })).toBeNull();
  });
});
