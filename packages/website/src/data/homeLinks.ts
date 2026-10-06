/**
 * Deep-link bodies for Home's own links (the places live in `places.ts`). Each
 * goes through `appLink` and is parsed by the app's own parser in the website
 * tests, so a renamed id fails CI. `t` carries an explicit Z: without it the
 * app reads the instant in each viewer's own time zone. The classroom date is
 * one on which the app's default view of Jupiter is its sunlit side: the view
 * direction is fixed, so on other dates (2027, for one) the link opens on the
 * night side.
 */
export const HOME_LINKS = {
  tour: 'tour=grandTour',
  parkFlight: 'clip=sondermarkenFlyout',
  classroom: 'focus=body-jupiter&t=2033-03-14T21:00:00Z',
} as const;
