import { describe, expect, it } from 'vitest';
import { parseRelayFrame } from '../../../src/utils/remote/parseRelayFrame';

describe('parseRelayFrame', () => {
  it('an object with a top-level relay key is a relay frame', () => {
    const frame = { relay: 'room', code: 'ROOM0000', origin: 'https://10.0.0.2:5173', onSky: true };
    expect(parseRelayFrame(JSON.stringify(frame))).toEqual(frame);
  });

  it('any relay key counts, whatever its value', () => {
    expect(parseRelayFrame('{"relay":null}')).toEqual({ relay: null });
  });

  it.each([
    ['app text', '{"from":"a","kind":"hello"}'],
    ['a nested relay key', '{"from":"a","kind":"command","command":{"relay":"room"}}'],
    ['an array', '["relay"]'],
    ['null', 'null'],
    ['a string', '"relay"'],
    ['not json', 'relay'],
  ])('%s is not a relay frame', (_, text) => {
    expect(parseRelayFrame(text)).toBeNull();
  });
});
