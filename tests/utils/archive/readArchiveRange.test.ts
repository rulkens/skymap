import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readArchiveRange } from '../../../src/utils/archive/readArchiveRange';

const URL = 'https://example.test/z3.p0.pack';
const respond = (body: Uint8Array, status: number) =>
  new Response(body as Uint8Array<ArrayBuffer>, { status });

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

it('sends one Range header spanning exactly the entry', async () => {
  fetchMock.mockResolvedValueOnce(respond(new Uint8Array(50), 206));
  const read = await readArchiveRange(URL, { offset: 100, length: 50 });
  expect(read.kind === 'bytes' && read.bytes.byteLength).toBe(50);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[1].headers.Range).toBe('bytes=100-149');
});

it('a short body reads failed', async () => {
  fetchMock.mockResolvedValueOnce(respond(new Uint8Array(5), 206));
  expect(await readArchiveRange(URL, { offset: 0, length: 8 })).toEqual({ kind: 'failed' });
});

it('cancels the body of a 200 so a whole pack is not downloaded', async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({ cancel, pull: (c) => c.enqueue(new Uint8Array(8)) });
  fetchMock.mockResolvedValueOnce(new Response(body, { status: 200 }));
  expect(await readArchiveRange(URL, { offset: 0, length: 4 })).toEqual({ kind: 'no-range' });
  await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
});

it('a thrown fetch reads failed', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('offline'));
  expect(await readArchiveRange(URL, { offset: 0, length: 4 })).toEqual({ kind: 'failed' });
});

it('a zero-length entry throws', async () => {
  // Bug caught: a `bytes=o-(o-1)` Range sent for an entry that stores nothing.
  await expect(readArchiveRange(URL, { offset: 40, length: 0 })).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});
