import { getCollection } from 'astro:content';

import type { DocsGroup } from '../@types/DocsGroup';
import { DOCS_TREE } from '../data/docsTree';

/**
 * The docs tree with every title in place: a text's own, from its front
 * matter, or the row's where the page is made from data. Astro-only, because
 * `astro:content` is: tools and tests read data/docsTree.ts, which needs no
 * title. A row with neither fails the build. A row's job is left behind, as
 * the tree goes to the contents as island props and a job is for the review bar.
 */
export async function loadDocsTree(): Promise<readonly DocsGroup[]> {
  const titles = new Map(
    (await getCollection('docs')).map((entry) => [`/docs/${entry.id}/`, entry.data.title]),
  );
  return DOCS_TREE.map((group) => ({
    ...group,
    pages: group.pages.map(({ title: own, job: _job, ...row }) => {
      const title = own ?? titles.get(row.path);
      if (title === undefined)
        throw new Error(
          `No title for "${row.path}": add one to its front matter, or to its row if it has no text file`,
        );
      return { title, ...row };
    }),
  }));
}
