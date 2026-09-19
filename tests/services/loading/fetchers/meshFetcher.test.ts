import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meshFetcher } from '../../../../src/services/loading/fetchers/meshFetcher';
import { useFetchMock } from '../../../setup/fetchMock';

vi.mock('../../../../src/data/mesh/meshBinaryFormat', () => ({
  decodeMesh: () => ({ decoded: true }),
}));

const fetch = useFetchMock();

/** `perseverance` ships a contact decal; its `_contact.webp` answers `contact`. */
function serve(contact: () => Promise<Response>): void {
  fetch.mock.mockImplementation((url: RequestInfo | URL) =>
    String(url).endsWith('_contact.webp')
      ? contact()
      : Promise.resolve(
          new Response(new Blob(['x']), { status: 200, headers: { 'content-type': 'image/png' } }),
        ),
  );
}

describe('meshFetcher', () => {
  let originalCreateImageBitmap: typeof globalThis.createImageBitmap | undefined;

  beforeEach(() => {
    originalCreateImageBitmap = globalThis.createImageBitmap;
    globalThis.createImageBitmap = vi
      .fn()
      .mockResolvedValue({} as ImageBitmap) as unknown as typeof globalThis.createImageBitmap;
  });

  afterEach(() => {
    globalThis.createImageBitmap = originalCreateImageBitmap!;
  });

  it('a missing contact mask drops the shadow, not the mesh', async () => {
    serve(() => Promise.resolve(new Response('', { status: 404 })));
    const asset = await meshFetcher(
      { meshKey: 'perseverance' },
      new AbortController().signal,
      () => {},
    );
    expect(asset).toMatchObject({ decoded: true });
    expect('contactShadow' in asset).toBe(false);
  });

  it('an aborted contact-mask fetch still aborts the load', async () => {
    serve(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    await expect(
      meshFetcher({ meshKey: 'perseverance' }, new AbortController().signal, () => {}),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
