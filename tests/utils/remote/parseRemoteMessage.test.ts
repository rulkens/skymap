import { describe, expect, it } from 'vitest';

import { parseRemoteMessage } from '../../../src/utils/remote/parseRemoteMessage';
import { REMOTE_PROTOCOL_VERSION } from '../../../src/data/remote/remoteProtocolVersion';
import type { RemoteCommand } from '../../../src/@types/remote/RemoteCommand';

const v = REMOTE_PROTOCOL_VERSION;
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
    expect(parse([{ v, from: 'a', kind: 'hello' }])).toBeNull();
    expect(parse('hello')).toBeNull();
    expect(parse(null)).toBeNull();
  });

  it('drops a message with no from', () => {
    expect(parse({ v, kind: 'hello' })).toBeNull();
    expect(parse({ v, from: '', kind: 'hello' })).toBeNull();
    expect(parse({ v, from: 'x'.repeat(65), kind: 'hello' })).toBeNull();
  });

  it('drops an unknown kind', () => {
    expect(parse({ v, from: 'a', kind: 'status' })).toBeNull();
  });

  it('accepts a hello at any version', () => {
    expect(parse({ from: 'a', kind: 'hello' })).toEqual({ v: 1, from: 'a', kind: 'hello' });
    for (const sent of [v - 1, v + 1]) {
      expect(parse({ v: sent, from: 'a', kind: 'hello' })).toEqual({
        v: sent,
        from: 'a',
        kind: 'hello',
      });
    }
  });

  it('drops a command, device event or search of another version', () => {
    const bodies = [
      { kind: 'command', command: home },
      { kind: 'device', event: { kind: 'resize', t: 1, widthPx: 200, heightPx: 100 } },
      { kind: 'search', requestId: 'r1', query: 'andro' },
    ];
    for (const body of bodies) {
      expect(parse({ v, from: 'a', ...body })).not.toBeNull();
      expect(parse({ from: 'a', ...body })).toBeNull();
      expect(parse({ v: v + 1, from: 'a', ...body })).toBeNull();
    }
  });

  it('cuts a search query to 64 characters', () => {
    const msg = parse({ v, from: 'a', kind: 'search', requestId: 'r1', query: 'x'.repeat(100) });
    expect(msg).toEqual({ v, from: 'a', kind: 'search', requestId: 'r1', query: 'x'.repeat(64) });
  });

  it('a command the parseCommand stub rejects drops the message', () => {
    expect(parse({ v, from: 'a', kind: 'command', command: home }, acceptAll)).toEqual({
      v,
      from: 'a',
      kind: 'command',
      command: home,
    });
    expect(parse({ v, from: 'a', kind: 'command', command: home }, rejectAll)).toBeNull();
  });

  it('a device message with a bad event drops', () => {
    expect(parse({ v, from: 'a', kind: 'device', event: { kind: 'leave', t: 'soon' } })).toBeNull();
  });
});
