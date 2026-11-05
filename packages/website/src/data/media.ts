/**
 * The site's media queries, named once. CSS writes a name as custom media, `@media (--narrow)`, which no browser
 * reads yet, so `customMedia` (tools/site/customMedia.ts) writes the query in when the CSS is compiled; scripts
 * take the string itself, and an image's `sizes` most often `narrowSizes()` (utils/narrowSizes.ts). Below a
 * width is `not all and (--laptop)`; a name that holds an `and` is not negated or nested. A new name reaches
 * the dev server's CSS only after it restarts.
 */
export const MEDIA = {
  /** The one layout break: one column, the phone's type and gutters (site.css). */
  narrow: '(max-width: 900px)',
  wide: '(min-width: 901px)',
  /** Tables and lists fold their columns. */
  phone: '(max-width: 699px)',
  tablet: '(min-width: 700px)',
  /** The smallest phones: the top bar's name and gaps give way. */
  'small-phone': '(max-width: 400px)',
  /** A list sets its items two to a row: the docs map, the steps, the science page's contents, the footer. */
  'two-up': '(min-width: 561px)',
  /** The science page's margin holds its picture, and the footer sets its name beside its lists. */
  laptop: '(min-width: 1100px)',
  /** The docs set their figures out into the margin. */
  broad: '(min-width: 1200px)',
  /** The home page's flight, on a phone held upright and on one held sideways. */
  portrait: '(max-width: 760px) and (orientation: portrait)',
  landscape: '(max-height: 520px) and (orientation: landscape)',
} as const;
