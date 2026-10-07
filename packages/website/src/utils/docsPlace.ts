import type { DocsGroup } from '../@types/DocsGroup';
import type { DocsPage } from '../@types/DocsPage';
import type { DocsPlace } from '../@types/DocsPlace';

/**
 * Find a docs page in the tree by its site path. Previous and next stay inside
 * the group and skip pages nobody has written. A page that is one of many of
 * a kind turns to the other pages of kinds, family after family, and the
 * group's own pages pass over them. A path with no row throws, so a content
 * file outside the tree fails the build.
 */
export function docsPlace(tree: readonly DocsGroup[], path: string): DocsPlace {
  for (const group of tree) {
    const at = group.pages.findIndex((page) => page.path === path);
    if (at === -1) continue;
    const page = group.pages[at]!;
    const written = (other: DocsPage) =>
      other.status === 'live' && Boolean(other.family) === Boolean(page.family);
    return {
      group,
      page,
      previous: group.pages.slice(0, at).reverse().find(written),
      next: group.pages.slice(at + 1).find(written),
    };
  }
  throw new Error(`No row for "${path}" in src/data/docsTree.ts`);
}
