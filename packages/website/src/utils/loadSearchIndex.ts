import type { PagefindApi } from '../@types/PagefindApi';
import { sitePath } from './sitePath.ts';

const INDEX_URL = sitePath('/pagefind/pagefind.js');

/** Pagefind's index, cut from the built pages by the site's build (astro.config.mjs). */
export function loadSearchIndex(): Promise<PagefindApi> {
  // The import is the browser's own, of an address only the build knows: Vite would rewrite one it bundled.
  return import(/* @vite-ignore */ INDEX_URL);
}
