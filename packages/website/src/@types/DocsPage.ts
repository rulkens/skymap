/**
 * One page of the docs tree. `path` is its site path, with both slashes;
 * `planned` is a page the tree has room for and nobody has written. `under`
 * names a subgroup, printed above the first page that carries it. `up` is the
 * landing page this page answers to, where that differs from its group's.
 */
export type DocsPage = {
  title: string;
  path: string;
  status: 'live' | 'planned';
  under?: string;
  up?: string;
};
