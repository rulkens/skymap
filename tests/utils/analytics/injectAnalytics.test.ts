// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectAnalytics } from '../../../src/utils/analytics/injectAnalytics';

describe('injectAnalytics', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('injects the tracker in a production build with the origin set', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_COUNTERSCALE_URL', 'https://counterscale.rulkens.workers.dev');

    injectAnalytics();

    const el = document.getElementById('counterscale-script') as HTMLScriptElement | null;
    expect(el).not.toBeNull();
    expect(el!.src).toBe('https://counterscale.rulkens.workers.dev/tracker.js');
    expect(el!.dataset.siteId).toBe('skymap');
    expect(el!.defer).toBe(true);
  });

  it('injects nothing outside a production build', () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('VITE_COUNTERSCALE_URL', 'https://counterscale.rulkens.workers.dev');

    injectAnalytics();

    expect(document.getElementById('counterscale-script')).toBeNull();
  });

  it('injects nothing when the origin is unset', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_COUNTERSCALE_URL', '');

    injectAnalytics();

    expect(document.getElementById('counterscale-script')).toBeNull();
  });

  it('strips a trailing slash from the origin', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_COUNTERSCALE_URL', 'https://x.example/');

    injectAnalytics();

    const el = document.getElementById('counterscale-script') as HTMLScriptElement | null;
    expect(el!.src).toBe('https://x.example/tracker.js');
  });
});
