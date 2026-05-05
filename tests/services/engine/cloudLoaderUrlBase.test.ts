import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataUrl } from '../../../src/services/engine/cloudLoader';

describe('dataUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a relative /data/ path when VITE_DATA_BASE_URL is unset', () => {
    vi.stubEnv('VITE_DATA_BASE_URL', '');
    expect(dataUrl('glade-medium.bin')).toBe('/data/glade-medium.bin');
  });

  it('prefixes the configured base when VITE_DATA_BASE_URL is set', () => {
    vi.stubEnv('VITE_DATA_BASE_URL', 'https://data.skymap.rulkens.com');
    expect(dataUrl('glade-medium.bin')).toBe(
      'https://data.skymap.rulkens.com/data/glade-medium.bin',
    );
  });

  it('strips a trailing slash on the base so the path joiner stays simple', () => {
    vi.stubEnv('VITE_DATA_BASE_URL', 'https://data.skymap.rulkens.com/');
    expect(dataUrl('filaments.bin')).toBe(
      'https://data.skymap.rulkens.com/data/filaments.bin',
    );
  });
});
