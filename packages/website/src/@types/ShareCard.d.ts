/**
 * A landing page's link-preview card: the page (its path, which names the card file and finds its nav label for
 * the line under the logo), the siteShots.ts row whose master is the picture, and, for a picture that is not
 * framed as a card (the dome disc), the CSS background placement that sets it beside the logo.
 */
export type ShareCard = { path: string; shot: string; backdrop?: string };
