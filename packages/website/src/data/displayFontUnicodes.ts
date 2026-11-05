/**
 * The characters the site's subset of Cormorant Garamond carries: Basic Latin,
 * Latin-1 (Søndermarken, Malmö), dashes, curly quotes and the ellipsis. A
 * character outside it falls back to another serif mid-word, so
 * tests/packages/website/siteMode.test.ts checks the built page against this.
 * After changing it, run `npx tsx tools/site/subsetDisplayFont.ts`.
 */
export const DISPLAY_FONT_UNICODES =
  'U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2026';
