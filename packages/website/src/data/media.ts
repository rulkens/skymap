/**
 * The site's media queries, named once. CSS writes a name as custom media, `@media (--narrow)`, which no browser
 * reads yet, so `customMedia` (tools/site/customMedia.ts) writes the query in when the CSS is compiled; scripts
 * take the string itself, and an image's `sizes` most often `narrowSizes()` (utils/narrowSizes.ts). A name that
 * holds an `and` is not negated or nested.
 */
export const MEDIA = {
  /** The one layout break: one column, the phone's type and gutters (site.css). */
  narrow: '(max-width: 900px)',
  wide: '(min-width: 901px)',
  /** Tables and lists fold their columns. */
  phone: '(max-width: 699px)',
  tablet: '(min-width: 700px)',
  /** The docs set their figures out into the margin. */
  broad: '(min-width: 1200px)',
  /** The home page's flight, on a phone held upright and on one held sideways. */
  portrait: '(max-width: 760px) and (orientation: portrait)',
  landscape: '(max-height: 520px) and (orientation: landscape)',
} as const;
