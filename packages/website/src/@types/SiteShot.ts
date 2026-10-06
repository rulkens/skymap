import type { SiteShotSettings } from './SiteShotSettings';

/**
 * One published picture of the app. `link` is the app's hash body and `query`
 * a query flag such as `dome`; together with `settings` they are everything
 * `npm run site:shots` needs to take it again. `size` is the viewport in CSS
 * pixels (shot at twice that), `widths` the files written, widest first being
 * no wider than the shot. `denseQuality` is the AVIF quality of every width
 * above the narrowest, for a row whose wider files are only ever drawn at 2x
 * or more, where coarser quality does not show. Its label (components/ShotCaption.astro): `title`
 * names what is shown, `caption` adds a sentence, `drawn` says what is data
 * and what is drawn, `credit` names third-party imagery; no full stop on the
 * first and the last.
 */
export type SiteShot = {
  id: string;
  link: string;
  query?: string;
  settings?: SiteShotSettings;
  size: { width: number; height: number };
  widths: readonly number[];
  denseQuality?: number;
  title: string;
  caption?: string;
  drawn?: string;
  alt: string;
  credit?: string;
};
