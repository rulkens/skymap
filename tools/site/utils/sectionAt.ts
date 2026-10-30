import type { SectionBand } from '../@types/SectionBand';

/**
 * The heading of the section a picture whose box spans `top` to `bottom` (page CSS pixels) sits in:
 * the band holding its middle, else the last band starting above it; a picture above every h2 is
 * in the page's opening.
 */
export function sectionAt(sections: readonly SectionBand[], top: number, bottom: number): string {
  const middle = (top + bottom) / 2;
  const holding = sections.find((s) => middle >= s.y && middle < s.y + s.h);
  const above = sections.filter((s) => s.y <= middle).at(-1);
  return (holding ?? above)?.text.trim() || '(opening)';
}
