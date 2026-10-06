import type { SiteShot } from '../../../packages/website/src/@types/SiteShot';

/**
 * The address a shot is taken from. `cinema` hides the app's chrome and makes
 * the canvas the whole picture (a `ui` shot leaves it out, to show that
 * chrome); the shot's own query flag follows it. A shot
 * of a later tour step boots on the bare app: the runner starts the tour at
 * that step itself, and a tour already playing from the link would fight it.
 */
export function siteShotUrl(
  base: string,
  shot: Pick<SiteShot, 'link' | 'query' | 'settings'>,
): string {
  const flags = [...(shot.settings?.ui ? [] : ['cinema']), ...(shot.query ? [shot.query] : [])];
  const hash = shot.settings?.tourStep === undefined ? `#${shot.link}` : '';
  return `${base.replace(/\/+$/, '')}/${flags.length > 0 ? `?${flags.join('&')}` : ''}${hash}`;
}
