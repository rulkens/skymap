import { describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../src/@types/worker/WorkerEnv';
import { CONTACT_PATH } from '../src/data/worker/contactConfig';
import worker from '../src/worker';

const assets = vi.fn(() => Promise.resolve(new Response('asset')));
const env: WorkerEnv = { ASSETS: { fetch: assets } };
const url = `https://skymap.example${CONTACT_PATH}`;

describe('worker routing', () => {
  it('answers POST to the contact path itself (503 until configured)', async () => {
    const response = await worker.fetch(new Request(url, { method: 'POST', body: '{}' }), env);
    expect(response.status).toBe(503);
    expect(assets).not.toHaveBeenCalled();
  });

  it.each([
    ['GET on the contact path', new Request(url)],
    [
      'POST elsewhere',
      new Request('https://skymap.example/info/1', { method: 'POST', body: '{}' }),
    ],
    ['the app', new Request('https://skymap.example/')],
    ['the site', new Request('https://skymap.example/home/domes/')],
  ])('hands %s to the static assets unchanged', async (_label, request) => {
    assets.mockClear();
    const response = await worker.fetch(request, env);
    expect(await response.text()).toBe('asset');
    expect(assets).toHaveBeenCalledWith(request);
  });
});
