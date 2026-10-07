import type { DocsGroup } from '../@types/DocsGroup';
import type { DocsPlace } from '../@types/DocsPlace';

/**
 * Find a docs page in the tree by its site path. Previous and next stay inside
 * the group and skip pages nobody has written. A path with no row throws, so a
 * content file outside the tree fails the build.
 */
export function docsPlace(tree: readonly DocsGroup[], path: string): DocsPlace {
  for (const group of tree) {
    const at = group.pages.findIndex((page) => page.path === path);
    if (at === -1) continue;
    const written = (page: { status: string }) => page.status === 'live';
    return {
      group,
      page: group.pages[at]!,
      previous: group.pages.slice(0, at).reverse().find(written),
      next: group.pages.slice(at + 1).find(written),
    };
  }
  throw new Error(`No row for "${path}" in src/data/docsTree.ts`);
}
