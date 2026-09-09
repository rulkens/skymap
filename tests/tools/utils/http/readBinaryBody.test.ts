import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { readBinaryBody } from '../../../../tools/utils/http/readBinaryBody';

function fakeReq(chunks: Buffer[]): IncomingMessage {
  return {
    on(ev: string, cb: (chunk?: Buffer) => void) {
      if (ev === 'data') for (const c of chunks) cb(c);
      if (ev === 'end') cb();
      return this;
    },
  } as unknown as IncomingMessage;
}

describe('readBinaryBody', () => {
  it('concatenates chunks in order, byte for byte', async () => {
    const result = await readBinaryBody(fakeReq([Buffer.from([1, 2]), Buffer.from([3, 4, 5])]));
    expect(Buffer.compare(result, Buffer.from([1, 2, 3, 4, 5]))).toBe(0);
  });

  it('resolves an empty buffer for a body with no chunks', async () => {
    const result = await readBinaryBody(fakeReq([]));
    expect(result.length).toBe(0);
  });
});
