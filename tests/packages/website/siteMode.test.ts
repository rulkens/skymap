/**
 * The preview-to-live switch (packages/website/src/data/site.ts) moves five
 * things at once: the robots meta, the base path, the canonical and structured
 * data origin, the sitemap and robots.txt, and the asset directory. A half-flip
 * leaks noindex into a live site or indexes a preview, so this builds Home in
 * each mode into a scratch directory and reads what came out.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const siteDir = resolve(import.meta.dirname, '../../../packages/website');
const ORIGIN = 'https://skymap.rulkens.com';

function build(mode: 'preview' | 'live') {
  const out = mkdtempSync(join(tmpdir(), `skymap-site-${mode}-`));
  const env = { ...process.env, SKYMAP_SITE_MODE: mode === 'live' ? 'live' : '' };
  execFileSync('npx', ['astro', 'build', '--outDir', out], { cwd: siteDir, env, stdio: 'pipe' });
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  const tag = (re: RegExp) => html.match(re)?.[1];
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(
    (m) => JSON.parse(m[1]!),
  );
  return { out, html, tag, jsonLd };
}

type Built = ReturnType<typeof build>;
let preview: Built;
let live: Built;

beforeAll(() => {
  preview = build('preview');
  live = build('live');
}, 120_000);

describe('preview mode (the default)', () => {
  it('is noindex, canonical under /home/, with no sitemap or robots.txt', () => {
    expect(preview.html).toContain('<meta name="robots" content="noindex">');
    expect(preview.html).not.toContain('rel="sitemap"');
    expect(preview.tag(/<link rel="canonical" href="([^"]+)"/)).toBe(`${ORIGIN}/home/`);
    expect(existsSync(join(preview.out, 'sitemap.xml'))).toBe(false);
    expect(existsSync(join(preview.out, 'robots.txt'))).toBe(false);
  });

  it('serves its assets from /home/_astro/, the directory public/_headers caches', () => {
    expect(preview.html).toContain('/home/_astro/');
    const headers = readFileSync(resolve(siteDir, '../../public/_headers'), 'utf8');
    expect(headers).toMatch(/^\/home\/_astro\/\*\n\s+Cache-Control: .*immutable/m);
  });

  it('structured data names the preview URL', () => {
    for (const node of preview.jsonLd) expect(JSON.stringify(node)).not.toContain(`${ORIGIN}/#`);
  });
});

describe('live mode', () => {
  it('is indexable, canonical at the root, with a sitemap and robots.txt naming it', () => {
    expect(live.html).not.toContain('noindex');
    expect(live.html).toContain('<link rel="sitemap" href="/sitemap.xml">');
    expect(live.tag(/<link rel="canonical" href="([^"]+)"/)).toBe(`${ORIGIN}/`);
    expect(readFileSync(join(live.out, 'sitemap.xml'), 'utf8')).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(readFileSync(join(live.out, 'robots.txt'), 'utf8')).toContain(
      `Sitemap: ${ORIGIN}/sitemap.xml`,
    );
  });

  it('serves its assets from /_astro/ and writes structured data for the root', () => {
    expect(live.html).toContain('"/_astro/');
    expect(live.html).not.toContain('/home/');
    expect(live.jsonLd.map((n) => n['@id'])).toContain(`${ORIGIN}/#website`);
  });
});

describe.each([
  ['preview', () => preview],
  ['live', () => live],
])('head of the %s build', (_mode, built) => {
  it('has a 20 to 60 character title, a 70 to 155 character description and en-GB', () => {
    const { html, tag } = built();
    expect(tag(/<title>([^<]+)<\/title>/)!.length).toBeGreaterThanOrEqual(20);
    expect(tag(/<title>([^<]+)<\/title>/)!.length).toBeLessThanOrEqual(60);
    const description = tag(/<meta name="description" content="([^"]+)"/)!;
    expect(description.length).toBeGreaterThanOrEqual(70);
    expect(description.length).toBeLessThanOrEqual(155);
    expect(html).toContain('<html lang="en-GB">');
  });

  it('has one canonical, complete social tags and parseable structured data', () => {
    const { html, jsonLd } = built();
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    for (const key of ['og:image:width', 'og:image:height', 'og:image:alt', 'og:locale'])
      expect(html, key).toContain(`property="${key}"`);
    for (const key of [
      'twitter:title',
      'twitter:description',
      'twitter:image',
      'twitter:image:alt',
    ])
      expect(html, key).toContain(`name="${key}"`);
    expect(jsonLd.map((n) => n['@type']).sort()).toEqual(['Person', 'WebApplication', 'WebSite']);
  });
});
