import { docsReviewStem } from './docsReviewStem';

/**
 * The file that holds a page's job, as a path under `packages/website/src/content`: a docs page's
 * text (`/docs/start/scene/` → `docs/start/scene.mdx`, front matter) or a landing page's structure
 * file (`/features/` → `pages/features/features.structure.yaml`, `/` →
 * `pages/home/home.structure.yaml`). Null for a path that names no such file: one docsReviewStem
 * refuses, the docs index, or a page made from data. Whether the file exists is for the caller.
 */
export function pageSourceFile(page: string): string | null {
  if (docsReviewStem(page) === null) return null;
  const path = page.replace(/^\/+|\/+$/g, '');
  if (path === '') return 'pages/home/home.structure.yaml';
  if (path === 'docs') return null;
  if (path.startsWith('docs/')) return `${path}.mdx`;
  return path.includes('/') ? null : `pages/${path}/${path}.structure.yaml`;
}
