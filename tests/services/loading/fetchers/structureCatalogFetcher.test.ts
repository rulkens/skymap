import { describe, expect, it } from 'vitest';
import {
  structureCatalogFetcher,
  parseStructureMeta,
} from '../../../../src/services/loading/fetchers/structureCatalogFetcher';
import { encodeStructureCatalog } from '../../../../src/data/structureCatalogFormat';
import type { StructureCatalog } from '../../../../src/@types/data/StructureCatalog';
import type { StructureMetaEntry } from '../../../../src/@types/loading/StructureCatalogPayload';
import { useFetchMock } from '../../../setup/fetchMock';

/** Build a tiny well-formed catalog of `count` records for fixtures. */
const makeCatalog = (count: number): StructureCatalog => ({
  count,
  positions: new Float32Array(count * 3).map((_, i) => i),
  physicalRadiusMpc: new Float32Array(count).fill(1),
  apparentRadiusMpc: new Float32Array(count).fill(2),
  significance: new Float32Array(count).fill(3),
  category: new Uint8Array(count),
});

const makeMeta = (count: number): StructureMetaEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    names: [`Cluster ${i}`],
    abell: i === 0 ? 'A2670' : null,
    description: `cluster ${i}`,
  }));

/**
 * Stub `fetch` so the `.ccat` and `_meta.json` URLs return their respective
 * bodies regardless of call order.  The fetcher fires both requests, so a
 * single mockResolvedValue can't serve both — key on the URL substring.
 */
const routeByUrl = (
  fetchMock: ReturnType<typeof useFetchMock>['mock'],
  ccatBuf: ArrayBuffer,
  metaJson: string,
): void => {
  fetchMock.mockImplementation((url: string) => {
    if (String(url).endsWith('.ccat')) {
      return Promise.resolve(new Response(ccatBuf, { status: 200 }));
    }
    return Promise.resolve(new Response(metaJson, { status: 200 }));
  });
};

describe('parseStructureMeta', () => {
  it('parses a valid array', () => {
    const parsed = parseStructureMeta(
      '[{"id":"a","names":["A"],"abell":null,"description":""}]',
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('a');
  });

  it('rejects a non-array root', () => {
    expect(() => parseStructureMeta('{}')).toThrow();
  });
});

describe('structureCatalogFetcher', () => {
  const fetch = useFetchMock();

  it('decodes the ccat and pairs it with meta', async () => {
    const ccat = encodeStructureCatalog(makeCatalog(2));
    routeByUrl(fetch.mock, ccat, JSON.stringify(makeMeta(2)));

    const payload = await structureCatalogFetcher(
      {},
      new AbortController().signal,
      () => {},
    );

    expect(payload.catalog.count).toBe(2);
    expect(payload.meta).toHaveLength(2);
    // A field round-trips through the JSON sidecar.
    expect(payload.meta[0]?.abell).toBe('A2670');
    expect(payload.meta[1]?.abell).toBeNull();
  });

  it('throws HttpError on a 404 from the ccat fetch', async () => {
    fetch.mock.mockImplementation((url: string) => {
      if (String(url).endsWith('.ccat')) {
        return Promise.resolve(new Response('nope', { status: 404 }));
      }
      return Promise.resolve(new Response(JSON.stringify(makeMeta(2)), { status: 200 }));
    });

    await expect(
      structureCatalogFetcher({}, new AbortController().signal, () => {}),
    ).rejects.toThrow();
  });

  it('throws HttpError on a 404 from the meta fetch', async () => {
    const ccat = encodeStructureCatalog(makeCatalog(2));
    fetch.mock.mockImplementation((url: string) => {
      if (String(url).endsWith('.ccat')) {
        return Promise.resolve(new Response(ccat, { status: 200 }));
      }
      return Promise.resolve(new Response('nope', { status: 404 }));
    });

    await expect(
      structureCatalogFetcher({}, new AbortController().signal, () => {}),
    ).rejects.toThrow();
  });

  it('throws on a count/meta-length mismatch', async () => {
    const ccat = encodeStructureCatalog(makeCatalog(2));
    routeByUrl(fetch.mock, ccat, JSON.stringify(makeMeta(1)));

    await expect(
      structureCatalogFetcher({}, new AbortController().signal, () => {}),
    ).rejects.toThrow(/mismatch/i);
  });

  it('passes the abort signal to both fetches', async () => {
    const ccat = encodeStructureCatalog(makeCatalog(1));
    fetch.mock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException('aborted', 'AbortError'));
      }
      const isCcat = String(_url).endsWith('.ccat');
      return Promise.resolve(
        new Response(isCcat ? ccat : JSON.stringify(makeMeta(1)), { status: 200 }),
      );
    });

    const controller = new AbortController();
    controller.abort();
    await expect(
      structureCatalogFetcher({}, controller.signal, () => {}),
    ).rejects.toThrow();
  });
});
