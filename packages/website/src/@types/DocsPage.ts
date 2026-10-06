/**
 * One page of the docs tree. `path` is its site path, with both slashes;
 * `planned` is a page the tree has room for and nobody has written. `up` is
 * the landing page this page answers to, where that differs from its group's.
 */
export type DocsPage = {
  title: string;
  path: string;
  status: 'live' | 'planned';
  up?: string;
};
