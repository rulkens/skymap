import { describe, expect, it } from 'vitest';

import { searchLanding } from '../../../packages/website/src/utils/searchLanding';

const page = {
  url: '/docs/reference/objects/',
  excerpt: '',
  meta: {},
  anchors: [
    { id: 'named-stars', text: 'Named stars', location: 10 },
    { id: 'star-almach', text: 'Almach Gamma Andromedae · HD 12533 star-almach', location: 20 },
    { id: 'void-bootes-void', text: 'Boötes Void Great Void void-bootes-void', location: 30 },
    { id: 'photometric-redshift', text: 'Photometric redshift', location: 40 },
    { id: 'redshift', text: 'Redshift', location: 50 },
    { id: 'm31', text: 'M31 Andromeda Galaxy · NGC 224 m31', location: 60 },
  ],
  locations: [20, 60],
};

describe('searchLanding', () => {
  it('opens at the element that holds the query as whole words, not at an earlier part of a word', () => {
    expect(searchLanding(page, 'andromeda')).toBe('/docs/reference/objects/#m31');
    expect(searchLanding(page, 'NGC 224')).toBe('/docs/reference/objects/#m31');
  });

  it('prefers the element that is the query to one that only holds it', () => {
    expect(searchLanding(page, 'redshift')).toBe('/docs/reference/objects/#redshift');
  });

  it('reads past case and accents', () => {
    expect(searchLanding(page, 'bootes void')).toBe('/docs/reference/objects/#void-bootes-void');
  });

  it('falls back to the last element before the first matched word, then to the page', () => {
    expect(searchLanding({ ...page, locations: [45] }, 'spectrum')).toBe(
      '/docs/reference/objects/#photometric-redshift',
    );
    expect(searchLanding({ ...page, locations: [5] }, 'spectrum')).toBe('/docs/reference/objects/');
    expect(searchLanding({ url: '/x/', excerpt: '', meta: {} }, 'spectrum')).toBe('/x/');
  });
});
