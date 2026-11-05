/**
 * The preview-to-live switch (packages/website/src/data/site.ts) moves five
 * things at once: the robots meta, the base path, the canonical and structured
 * data origin, the sitemap and robots.txt, and the asset directory. A half-flip
 * leaks noindex into a live site or indexes a preview, so this builds Home in
 * each mode into a scratch directory and reads what came out.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DISPLAY_FONT_UNICODES } from '../../../packages/website/src/data/displayFontUnicodes';

const siteDir = resolve(import.meta.dirname, '../../../packages/website');
// Not os.tmpdir(): astro renames prerendered assets into outDir, and on CI /tmp
// is another filesystem, so the rename fails with EXDEV.
const scratchDir = resolve(import.meta.dirname, '../../../node_modules/.cache/skymap-site-mode');
const ORIGIN = 'https://skymap.rulkens.com';
// Vitest's own import.meta.env, which it puts in process.env. Astro reads every variable there into the server's
// import.meta.env, so a build that inherits them renders its pages with BASE_URL '/' and DEV set.
const VITEST_ENV = ['BASE_URL', 'MODE', 'DEV', 'PROD', 'SSR'];

function build(mode: 'preview' | 'live') {
  mkdirSync(scratchDir, { recursive: true });
  const out = mkdtempSync(join(scratchDir, `${mode}-`));
  const inherited = Object.entries(process.env).filter(([key]) => !VITEST_ENV.includes(key));
  const env = { ...Object.fromEntries(inherited), SKYMAP_SITE_MODE: mode === 'live' ? 'live' : '' };
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

afterAll(() => rmSync(scratchDir, { recursive: true, force: true }));

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
    // Below `/*.js`, or the search worker keeps that rule's year (public/_headers says why).
    expect(headers).toMatch(/^\/\*\.js\n[\s\S]*^\/home\/pagefind\/\*\n\s+! Cache-Control\n/m);
    expect(existsSync(join(preview.out, 'pagefind/pagefind-worker.js'))).toBe(true);
  });

  // The shots skip the bundler: a page names them by hand, so a wrong base or a file the build left out is a broken picture.
  it('serves its shots from /home/shots/, cached for a year, and the build holds every one it names', () => {
    const shots = [...preview.html.matchAll(/\/home\/shots\/([^\s",]+)/g)].map((m) => m[1]!);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.filter((file) => !existsSync(join(preview.out, 'shots', file)))).toEqual([]);
    const headers = readFileSync(resolve(siteDir, '../../public/_headers'), 'utf8');
    expect(headers).toMatch(/^\/home\/shots\/\*\n\s+Cache-Control: .*immutable/m);
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

  // A search engine cuts a longer title or description, and two pages with one title cannot be told apart in its list.
  it('gives every page one h1, a title of its own up to 60 characters and a description up to 155', () => {
    const pages = readdirSync(built().out, { recursive: true, encoding: 'utf8' })
      .filter((name) => name.endsWith('.html'))
      .map((name) => {
        const page = readFileSync(join(built().out, name), 'utf8');
        // An entity is one character on the results page.
        const text = (re: RegExp) => (page.match(re)?.[1] ?? '').replace(/&#?\w+;/g, '.');
        return {
          name,
          title: text(/<title>([^<]+)<\/title>/),
          description: text(/<meta name="description" content="([^"]+)"/),
          h1: page.match(/<h1[\s>]/g)?.length,
        };
      });
    expect(pages.length).toBeGreaterThan(20);
    const titles = pages.map((page) => page.title);
    expect(titles.filter((title, i) => titles.indexOf(title) !== i)).toEqual([]);
    expect(
      pages.filter(
        (page) =>
          page.h1 !== 1 ||
          page.title.length === 0 ||
          page.title.length > 60 ||
          page.description.length === 0 ||
          page.description.length > 155,
      ),
    ).toEqual([]);
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

  // The display face is a subset: a character outside it would render in a fallback serif mid-word.
  it('prints no character the display font subset lacks', () => {
    const ranges = DISPLAY_FONT_UNICODES.split(',').map((range) =>
      range
        .slice(2)
        .split('-')
        .map((hex) => parseInt(hex, 16)),
    );
    const text = built()
      .html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
      .replace(/<[^>]+>/g, '');
    const missing = [...new Set(text)].filter((char) => {
      const code = char.codePointAt(0)!;
      return code > 0x7e && !ranges.some(([from, to = from]) => code >= from! && code <= to!);
    });
    expect(missing).toEqual([]);
  });
});
