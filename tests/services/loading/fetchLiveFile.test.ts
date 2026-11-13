import { describe, expect, it } from 'vitest';

import { fetchLiveFile } from '../../../src/services/loading/fetchLiveFile';
import { useFetchMock } from '../../setup/fetchMock';

const pointer = (files: Record<string, string>) =>
  new Response(JSON.stringify({ date: '2026-11-13', builtAt: 'x', files }), { status: 200 });

describe('fetchLiveFile', () => {
  const fetch = useFetchMock();
  const signal = new AbortController().signal;

  it('fetches the file the pointer names', async () => {
    fetch.mock
      .mockResolvedValueOnce(pointer({ 'a.bin': 'live/v1/files/x/2026-11-13/a.bin' }))
      .mockResolvedValueOnce(new Response(new Uint8Array([7, 8]), { status: 200 }));
    const buf = await fetchLiveFile('x', 'a.bin', signal, () => {});
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([7, 8]));
    expect(String(fetch.mock.mock.calls[0]![0])).toContain('live/v1/x.json');
    expect(fetch.mock.mock.calls[0]![1]).toMatchObject({ cache: 'no-cache' });
    expect(String(fetch.mock.mock.calls[1]![0])).toContain('live/v1/files/x/2026-11-13/a.bin');
  });

  it('rejects when the pointer lacks the file', async () => {
    fetch.mock.mockResolvedValueOnce(pointer({}));
    await expect(fetchLiveFile('x', 'a.bin', signal, () => {})).rejects.toThrow(
      /live\/v1\/x\.json/,
    );
  });

  it('rejects when the named file 404s', async () => {
    fetch.mock
      .mockResolvedValueOnce(pointer({ 'a.bin': 'live/v1/files/x/d/a.bin' }))
      .mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(fetchLiveFile('x', 'a.bin', signal, () => {})).rejects.toThrow(
      /files\/x\/d\/a\.bin/,
    );
  });
});
