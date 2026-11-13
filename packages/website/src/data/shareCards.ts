import type { ShareCard } from '../@types/ShareCard';

/** One card per landing page (npm run site:shots writes them); every other page shares the site card, og-card. */
export const SHARE_CARDS: readonly ShareCard[] = [
  { path: '/about/', shot: 'card-about' },
  { path: '/classroom/', shot: 'card-classroom' },
  { path: '/domes/', shot: 'dome-earth', backdrop: 'right 40px center / auto 92% no-repeat' },
  { path: '/features/', shot: 'card-features' },
  { path: '/science/', shot: 'card-science' },
];
