import { FOOTER_GROUPS } from '../data/nav';

/** A page's name as the footer links it ("Domes and museums"); the footer is the one list naming every page. */
export function pageLabel(path: string): string {
  const item = FOOTER_GROUPS.flatMap((group) => group.items).find((link) => link.path === path);
  if (!item) throw new Error(`No footer link for ${path}`);
  return item.label;
}
