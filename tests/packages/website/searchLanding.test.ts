import { describe, expect, it } from 'vitest';

import { searchLanding } from '../../../packages/website/src/utils/searchLanding';

const objects = {
  url: '/docs/reference/objects/',
  excerpt: '',
  meta: { title: 'Object catalogue' },
  anchors: [
    { id: 'page', text: '' },
    { id: 'named-stars', text: 'Named stars' },
    { id: 'star-almach', text: 'Almach Gamma Andromedae · HD 12533 star-almach' },
    { id: 'void-bootes-void', text: 'Boötes Void Great Void void-bootes-void' },
    { id: 'photometric-redshift', text: 'Photometric redshift' },
    { id: 'redshift', text: 'Redshift' },
    { id: 'm31', text: 'M31 Andromeda Galaxy · NGC 224 m31' },
  ],
};
const time = {
  url: '/docs/guide/time/',
  excerpt: '',
  meta: { title: 'Time' },
  anchors: [
    { id: 'read-the-clock', text: 'Read the clock' },
    { id: 'set-a-date-and-time', text: 'Set a date and time' },
  ],
};

describe('searchLanding', () => {
  it('opens the page at its top when its title holds the query', () => {
    expect(searchLanding(time, 'time')).toBe('/docs/guide/time/');
    expect(searchLanding(objects, 'catalogue')).toBe('/docs/reference/objects/');
    expect(searchLanding({ ...time, meta: { title: 'Tours and exhibits' } }, 'tour')).toBe(
      '/docs/guide/time/',
    );
  });

  it('opens at the element that holds the query as whole words, not at an earlier part of a word', () => {
    expect(searchLanding(objects, 'andromeda')).toBe('/docs/reference/objects/#m31');
    expect(searchLanding(objects, 'NGC 224')).toBe('/docs/reference/objects/#m31');
    expect(searchLanding(time, 'clock')).toBe('/docs/guide/time/#read-the-clock');
  });

  it('prefers the element that is the query to one that only holds it', () => {
    expect(searchLanding(objects, 'redshift')).toBe('/docs/reference/objects/#redshift');
  });

  it('reads past case and accents', () => {
    expect(searchLanding(objects, 'bootes void')).toBe('/docs/reference/objects/#void-bootes-void');
  });

  it('opens the page at its top for words that only its running text holds', () => {
    expect(searchLanding(objects, 'spectrum')).toBe('/docs/reference/objects/');
    expect(searchLanding({ url: '/x/', excerpt: '', meta: {} }, 'spectrum')).toBe('/x/');
  });
});
