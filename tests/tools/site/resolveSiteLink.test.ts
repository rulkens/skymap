import { describe, expect, it } from 'vitest';

import type { SiteLinkContext } from '../../../tools/site/@types/SiteLinkContext';
import { resolveSiteLink } from '../../../tools/site/utils/resolveSiteLink';

const built = new Set([
  'index.html',
  'docs/index.html',
  'docs/credits/index.html',
  '_astro/site.css',
]);
const ctx: SiteLinkContext = {
  base: '/home/',
  hasBuilt: (rel) => built.has(rel),
  hasPublic: (rel) => rel === 'favicon.svg' || rel === 'images/featured/m31.webp',
  idsOf: (rel) => new Set(rel === 'index.html' ? ['main', 'places'] : []),
  notYetBuilt: ['/educators/', '/docs/credits/'],
};
const check = (href: string, page = '/home/') => resolveSiteLink(page, href, ctx).kind;

describe('resolveSiteLink', () => {
  it('skips what is not ours to check', () => {
    expect(check('https://arxiv.org/abs/1')).toBe('skip');
    expect(check('//cdn.example/x.js')).toBe('skip');
    expect(check('mailto:a@b.c')).toBe('skip');
  });

  it('resolves base-prefixed pages and files, with or without a trailing slash', () => {
    expect(check('/home/docs/')).toBe('ok');
    expect(check('/home/docs')).toBe('ok');
    expect(check('/home/_astro/site.css')).toBe('ok');
    expect(check('/home/nope/')).toBe('broken');
  });

  it('resolves relative links against the page that holds them', () => {
    expect(check('../_astro/site.css', '/home/docs/')).toBe('ok');
    expect(check('credits/', '/home/docs/')).toBe('stale-pending');
  });

  it('sends root-absolute paths outside the base to the app and public/', () => {
    expect(check('/')).toBe('ok');
    expect(check('/#focus=body-earth')).toBe('ok');
    expect(check('/favicon.svg')).toBe('ok');
    expect(check('/images/featured/m31.webp')).toBe('ok');
    expect(check('/images/featured/missing.webp')).toBe('broken');
  });

  it('checks anchors on built pages only', () => {
    expect(check('#main')).toBe('ok');
    expect(check('#nope')).toBe('broken');
    expect(check('#top')).toBe('ok');
    expect(check('/home/#places')).toBe('ok');
    expect(check('/#anything-the-app-reads')).toBe('ok');
  });

  it('reports planned pages, and fails once one exists', () => {
    expect(check('/home/educators/')).toBe('pending');
    expect(check('/home/docs/credits/')).toBe('stale-pending');
  });
});
