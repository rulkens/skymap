import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { readJsonBody } from '../../../../tools/utils/http/readJsonBody';

/** Minimal fake `IncomingMessage`: fires 'data' with the given chunks then
 *  'end', matching the event sequence a real request stream produces. */
function fakeReq(chunks: string[]): IncomingMessage {
  return {
    on(ev: string, cb: (chunk?: Buffer) => void) {
      if (ev === 'data') for (const c of chunks) cb(Buffer.from(c));
      if (ev === 'end') cb();
      return this;
    },
  } as unknown as IncomingMessage;
}

describe('readJsonBody', () => {
  it('parses a JSON body split across multiple chunks', async () => {
    const result = await readJsonBody(fakeReq(['{"a":1,', '"b":2}']));
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('resolves an empty body to {}', async () => {
    const result = await readJsonBody(fakeReq([]));
    expect(result).toEqual({});
  });

  it('rejects on malformed JSON rather than resolving a partial value', async () => {
    await expect(readJsonBody(fakeReq(['{not json']))).rejects.toThrow();
  });
});
