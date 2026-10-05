/**
 * Deep-link bodies for Home's own links (the places live in `places.ts`). Each
 * goes through `appLink` and is parsed by the app's own parser in the website
 * tests, so a renamed id fails CI. `t` carries an explicit Z: without it the
 * app reads the instant in each viewer's own time zone.
 */
export const HOME_LINKS = {
  tour: 'tour=grandTour',
  parkFlight: 'clip=sondermarkenFlyout',
  classroom: 'focus=body-jupiter&t=2027-03-14T21:00:00Z',
} as const;
