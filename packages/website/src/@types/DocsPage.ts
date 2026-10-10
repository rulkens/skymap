/**
 * One page of the docs tree. `path` is its site path, with both slashes;
 * `planned` is a page the tree has room for and nobody has written. `up` is
 * the landing page this page answers to, where that differs from its group's.
 * `family` marks a page that is one of many of a kind (the data sources): the
 * sidebar lists it only beside its own family, the docs index leaves it to
 * the page that lists them all, and previous and next stay within the family.
 */
export type DocsPage = {
  title: string;
  path: string;
  status: 'live' | 'planned';
  up?: string;
  family?: string;
};
