import type { NavGroup } from '../@types/NavGroup';
import type { NavItem } from '../@types/NavItem';

/** Parallel short nouns, per 12-taste-and-structure 4.2; Home's section headings stay imperative. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Classrooms', path: '/classroom/', icon: 'classroom' },
  { label: 'Domes and museums', path: '/domes/', icon: 'dome' },
  { label: 'Science', path: '/science/', icon: 'science' },
  { label: 'Docs', path: '/docs/', icon: 'docs' },
];

/** Every page of the site, grouped by the question a reader arrives at the foot of a page with. */
export const FOOTER_GROUPS: NavGroup[] = [
  {
    heading: 'Who it is for',
    items: [
      { label: 'Classrooms', path: '/classroom/', icon: 'classroom' },
      { label: 'Domes and museums', path: '/domes/', icon: 'dome' },
    ],
  },
  {
    heading: 'What it rests on',
    items: [
      { label: 'Science', path: '/science/', icon: 'science' },
      { label: 'Credits', path: '/docs/credits/', icon: 'credits' },
      { label: 'Cite skymap', path: '/docs/cite/', icon: 'cite' },
    ],
  },
  {
    heading: 'The project',
    items: [
      { label: 'Docs', path: '/docs/', icon: 'docs' },
      { label: 'About', path: '/about/', icon: 'about' },
      { label: 'Privacy', path: '/privacy/', icon: 'privacy' },
    ],
  },
];
