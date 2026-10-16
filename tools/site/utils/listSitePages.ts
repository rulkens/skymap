import { readdirSync } from 'node:fs';

// Search-index and asset folders hold no pages; a page is a directory's index.html or the 404.
const NOT_PAGES = /(^|\/)(pagefind|_astro)\//;

/** The routes of a built site (`/`, `/about/`, `/404.html`), read from its files, sorted. */
export function listSitePages(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => !NOT_PAGES.test(file))
    .flatMap((file) => {
      if (file === '404.html') return ['/404.html'];
      if (file === 'index.html') return ['/'];
      return file.endsWith('/index.html') ? [`/${file.slice(0, -'index.html'.length)}`] : [];
    })
    .sort();
}
