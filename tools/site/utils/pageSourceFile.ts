import { docsReviewStem } from './docsReviewStem';

/**
 * The text that holds a page's front matter, as a path under `packages/website/src/content`
 * (`/docs/start/scene/` → `docs/start/scene.mdx`, `/features/` → `pages/features.mdx`, `/` →
 * `pages/index.mdx`), or null for a path that names no such text: one docsReviewStem refuses,
 * the docs index, or a page made from data. Whether the file exists is for the caller.
 */
export function pageSourceFile(page: string): string | null {
  if (docsReviewStem(page) === null) return null;
  const path = page.replace(/^\/+|\/+$/g, '');
  if (path === '') return 'pages/index.mdx';
  if (path === 'docs') return null;
  if (path.startsWith('docs/')) return `${path}.mdx`;
  return path.includes('/') ? null : `pages/${path}.mdx`;
}
