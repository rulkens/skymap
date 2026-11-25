import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createArchiveTileSource } from '../../../../../../src/layers/body/surfaceTiles/stream/load/createArchiveTileSource';
import { surfaceTileMortonKey } from '../../../../../../src/layers/body/surfaceTiles/archive/utils/surfaceTileMortonKey';
import { encodeSurfaceTileArchiveIndex } from '../../../../../../tools/utils/textures/encodeSurfaceTileArchiveIndex';

const tile = (x: number, y = 0) => ({ product: 'albedo' as const, z: 3, x, y });
const entry = (x: number, offset: number, length: number) => ({
  key: surfaceTileMortonKey(x, 0),
  part: 0,
  offset,
  length,
});
const idx = (...e: ReturnType<typeof entry>[]) => encodeSurfaceTileArchiveIndex(e, 1);
const ok = (body: Uint8Array, status = 200) =>
  new Response(body as Uint8Array<ArrayBuffer>, { status });

const MISSING = { kind: 'missing' };
const FAILED = { kind: 'failed' };

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('reads a tile with one Range request after one index fetch', async () => {
  fetchMock
    .mockResolvedValueOnce(ok(idx(entry(1, 100, 50))))
    .mockResolvedValueOnce(ok(new Uint8Array(50), 206));
  const read = await createArchiveTileSource('earth-tiles/v11').readTile(tile(1));
  expect(read.kind === 'bytes' && read.bytes.byteLength).toBe(50);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [indexCall, packCall] = fetchMock.mock.calls;
  expect(indexCall?.[0]).toMatch(/earth-tiles\/v11\/albedo\/z3\.idx$/);
  expect(packCall?.[0]).toMatch(/z3\.p0\.pack$/);
  expect(packCall?.[1].headers.Range).toBe('bytes=100-149');
});

it('memoises the level index across tiles', async () => {
  fetchMock.mockImplementation(async (url: string) =>
    url.endsWith('.idx')
      ? ok(idx(entry(1, 0, 4), entry(2, 4, 4), entry(3, 8, 4)))
      : ok(new Uint8Array(4), 206),
  );
  const source = createArchiveTileSource('p');
  await Promise.all([1, 2, 3].map((x) => source.readTile(tile(x))));
  expect(fetchMock.mock.calls.filter(([u]) => u.endsWith('.idx'))).toHaveLength(1);
});

it('zero-length entry reads empty without fetching', async () => {
  // Bug caught: a `bytes=o-(o-1)` Range sent for a flat tile, or empty read as failed.
  fetchMock.mockResolvedValueOnce(ok(idx(entry(1, 40, 0))));
  expect(await createArchiveTileSource('p').readTile(tile(1))).toEqual({ kind: 'empty' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('key absent from the index reads missing', async () => {
  fetchMock.mockResolvedValueOnce(ok(idx(entry(1, 0, 4))));
  expect(await createArchiveTileSource('p').readTile(tile(2))).toEqual(MISSING);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('a 404 reads failed', async () => {
  fetchMock
    .mockResolvedValueOnce(ok(idx(entry(1, 0, 4))))
    .mockResolvedValueOnce(new Response(null, { status: 404 }));
  expect(await createArchiveTileSource('p').readTile(tile(1))).toEqual(FAILED);
});

it('an aborted fetch reads failed', async () => {
  fetchMock
    .mockResolvedValueOnce(ok(idx(entry(1, 0, 4))))
    .mockRejectedValueOnce(new DOMException('deadline', 'TimeoutError'));
  expect(await createArchiveTileSource('p').readTile(tile(1))).toEqual(FAILED);
});

it('a level whose index 404s reads missing and is not refetched', async () => {
  fetchMock.mockImplementation(async () => new Response(null, { status: 404 }));
  const source = createArchiveTileSource('p');
  expect(await source.readTile(tile(1))).toEqual(MISSING);
  expect(await source.readTile(tile(2))).toEqual(MISSING);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('retries the index after a network error', async () => {
  fetchMock
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(ok(idx(entry(1, 0, 4))))
    .mockResolvedValueOnce(ok(new Uint8Array(4), 206));
  const source = createArchiveTileSource('p');
  expect(await source.readTile(tile(1))).toEqual(FAILED);
  expect((await source.readTile(tile(1))).kind).toBe('bytes');
});

it('reads failed and warns once when a part answers 200 instead of 206', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  fetchMock.mockImplementation(async (url: string) =>
    url.endsWith('.idx') ? ok(idx(entry(1, 0, 4), entry(2, 4, 4))) : ok(new Uint8Array(100)),
  );
  const source = createArchiveTileSource('p');
  expect(await source.readTile(tile(1))).toEqual(FAILED);
  expect(await source.readTile(tile(2))).toEqual(FAILED);
  expect(warn).toHaveBeenCalledTimes(1);
});

it('a short body reads failed', async () => {
  fetchMock
    .mockResolvedValueOnce(ok(idx(entry(1, 0, 8))))
    .mockResolvedValueOnce(ok(new Uint8Array(5), 206));
  expect(await createArchiveTileSource('p').readTile(tile(1))).toEqual(FAILED);
});

it('a level whose index has a bad magic reads missing and is not refetched', async () => {
  fetchMock.mockImplementation(async () => ok(new Uint8Array(64)));
  const source = createArchiveTileSource('p');
  expect(await source.readTile(tile(1))).toEqual(MISSING);
  expect(await source.readTile(tile(2))).toEqual(MISSING);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('retries the index after a 5xx', async () => {
  fetchMock
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(ok(idx(entry(1, 0, 4))))
    .mockResolvedValueOnce(ok(new Uint8Array(4), 206));
  const source = createArchiveTileSource('p');
  expect(await source.readTile(tile(1))).toEqual(FAILED);
  expect((await source.readTile(tile(1))).kind).toBe('bytes');
});

it('cancels the body of a 200 so a whole pack is not downloaded', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const cancel = vi.fn();
  const body = new ReadableStream({ cancel, pull: (c) => c.enqueue(new Uint8Array(8)) });
  fetchMock
    .mockResolvedValueOnce(ok(idx(entry(1, 0, 4))))
    .mockResolvedValueOnce(new Response(body, { status: 200 }));
  expect(await createArchiveTileSource('p').readTile(tile(1))).toEqual(FAILED);
  await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
});
