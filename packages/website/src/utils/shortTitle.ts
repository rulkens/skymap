/** A page's title is followed by " | skymap docs" and the whole may be 60 characters (tests/packages/website/siteMode.test.ts). */
const TITLE_MAX = 46;

/**
 * A data page's title from its entry's heading in `ATTRIBUTIONS.md`. A heading
 * that fits is used whole. A longer one loses, in this order and only as far
 * as needed: its closing bracket, what follows ", the", what follows a colon,
 * and what stands before the colon. If none of that fits it stops at a word.
 */
export function shortTitle(heading: string, max = TITLE_MAX): string {
  const whole = heading.replace(/\\\*/g, '*').trim();
  const noBracket = whole.replace(/\s*\([^()]*\)$/, '');
  const noGloss = noBracket.replace(/, the .*$/, '');
  const tries = [
    whole,
    noBracket,
    noGloss,
    noGloss.replace(/: .*$/, ''),
    noGloss.replace(/^[^:]*: /, '').replace(/^./, (first) => first.toUpperCase()),
  ];
  const fits = tries.find((title) => title.length <= max);
  return fits ?? noGloss.slice(0, noGloss.lastIndexOf(' ', max));
}
