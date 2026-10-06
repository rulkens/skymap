import type { NavItem } from '../@types/NavItem';

/** Parallel short nouns, per 12-taste-and-structure 4.2; Home's section headings stay imperative. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Classrooms', path: '/classroom/', icon: 'classroom' },
  { label: 'Domes and museums', path: '/domes/', icon: 'dome' },
  { label: 'Science', path: '/science/', icon: 'science' },
  { label: 'Docs', path: '/docs/', icon: 'docs' },
];

export const FOOTER_ITEMS: NavItem[] = [
  { label: 'Docs', path: '/docs/', icon: 'docs' },
  { label: 'Credits', path: '/docs/credits/', icon: 'credits' },
  { label: 'Cite skymap', path: '/docs/cite/', icon: 'cite' },
  { label: 'About', path: '/about/', icon: 'about' },
  { label: 'Privacy', path: '/privacy/', icon: 'privacy' },
];
