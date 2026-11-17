import { FOOTER_GROUPS } from '../../../data/nav.ts';
import { REPO_URL } from '../../../data/siteIdentity.ts';
import { sitePath } from '../../../utils/sitePath.ts';

export const GROUND = 'lesson-universe';
// The repository is the one link here that leaves the site, so it is not a row of the site's own pages.
const REPO_LINK = { label: 'GitHub', icon: 'code', href: REPO_URL } as const;
export const groups = FOOTER_GROUPS.map((group, i) => ({
  heading: group.heading,
  links: [
    ...group.items.map((item) => ({
      label: item.label,
      icon: item.icon,
      href: sitePath(item.path),
    })),
    ...(i === FOOTER_GROUPS.length - 1 ? [REPO_LINK] : []),
  ],
}));
