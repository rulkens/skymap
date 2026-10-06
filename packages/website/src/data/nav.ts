import type { NavItem } from '../@types/NavItem';

/** Parallel short nouns, per 12-taste-and-structure 4.2; Home's section headings stay imperative. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Classrooms', path: '/classroom/' },
  { label: 'Domes and museums', path: '/domes/' },
  { label: 'Science', path: '/science/' },
  { label: 'Docs', path: '/docs/' },
];

export const FOOTER_ITEMS: NavItem[] = [
  { label: 'Docs', path: '/docs/' },
  { label: 'Credits', path: '/docs/credits/' },
  { label: 'Cite skymap', path: '/docs/cite/' },
  { label: 'About', path: '/about/' },
  { label: 'Privacy', path: '/privacy/' },
];
