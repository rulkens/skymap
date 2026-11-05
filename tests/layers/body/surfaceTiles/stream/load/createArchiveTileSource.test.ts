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
  const bytes = await createArchiveTileSource('earth-tiles/v11').readTile(tile(1));
  expect(bytes?.byteLength).toBe(50);
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

it('returns null for a tile absent from the index without requesting it', async () => {
  fetchMock.mockResolvedValueOnce(ok(idx(entry(1, 0, 4))));
  expect(await createArchiveTileSource('p').readTile(tile(2))).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('treats an index 404 as an empty level and does not refetch it', async () => {
  fetchMock.mockImplementation(async () => new Response(null, { status: 404 }));
  const source = createArchiveTileSource('p');
  expect(await source.readTile(tile(1))).toBeNull();
  expect(await source.readTile(tile(2))).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('retries the index after a network error', async () => {
  fetchMock
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(ok(idx(entry(1, 0, 4))))
    .mockResolvedValueOnce(ok(new Uint8Array(4), 206));
  const source = createArchiveTileSource('p');
  expect(await source.readTile(tile(1))).toBeNull();
  expect((await source.readTile(tile(1)))?.byteLength).toBe(4);
});

it('returns null and warns once when a part answers 200 instead of 206', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  fetchMock.mockImplementation(async (url: string) =>
    url.endsWith('.idx') ? ok(idx(entry(1, 0, 4), entry(2, 4, 4))) : ok(new Uint8Array(100)),
  );
  const source = createArchiveTileSource('p');
  expect(await source.readTile(tile(1))).toBeNull();
  expect(await source.readTile(tile(2))).toBeNull();
  expect(warn).toHaveBeenCalledTimes(1);
});

it('returns null when a 206 body length differs from the entry length', async () => {
  fetchMock
    .mockResolvedValueOnce(ok(idx(entry(1, 0, 8))))
    .mockResolvedValueOnce(ok(new Uint8Array(5), 206));
  expect(await createArchiveTileSource('p').readTile(tile(1))).toBeNull();
});

it('reads a level whose index has a bad magic as empty and does not refetch it', async () => {
  fetchMock.mockImplementation(async () => ok(new Uint8Array(64)));
  const source = createArchiveTileSource('p');
  expect(await source.readTile(tile(1))).toBeNull();
  expect(await source.readTile(tile(2))).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('retries the index after a 5xx', async () => {
  fetchMock
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(ok(idx(entry(1, 0, 4))))
    .mockResolvedValueOnce(ok(new Uint8Array(4), 206));
  const source = createArchiveTileSource('p');
  expect(await source.readTile(tile(1))).toBeNull();
  expect((await source.readTile(tile(1)))?.byteLength).toBe(4);
});

it('cancels the body of a 200 so a whole pack is not downloaded', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const cancel = vi.fn();
  const body = new ReadableStream({ cancel, pull: (c) => c.enqueue(new Uint8Array(8)) });
  fetchMock
    .mockResolvedValueOnce(ok(idx(entry(1, 0, 4))))
    .mockResolvedValueOnce(new Response(body, { status: 200 }));
  expect(await createArchiveTileSource('p').readTile(tile(1))).toBeNull();
  await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
});
