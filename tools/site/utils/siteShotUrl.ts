import type { SiteShot } from '../../../packages/website/src/@types/SiteShot';
import { shotHash } from '../../../packages/website/src/utils/shotHash';

/**
 * The address a shot is taken from. `cinema` hides the app's chrome and makes
 * the canvas the whole picture (a `ui` shot leaves it out, to show that
 * chrome); the shot's own query flag follows it, then `remote` where a phone
 * is to pair. A shot of a later tour step boots on its `layers` alone: the runner
 * starts the tour at that step itself, and a tour already playing from the
 * link would fight it.
 */
export function siteShotUrl(
  base: string,
  shot: Pick<SiteShot, 'link' | 'query' | 'settings'>,
): string {
  const flags = [
    ...(shot.settings?.ui ? [] : ['cinema']),
    ...(shot.query ? [shot.query] : []),
    ...(shot.settings?.remote || shot.settings?.pairing ? ['remote'] : []),
  ];
  const hash = shotHash(
    shot.settings?.tourStep === undefined ? shot : { settings: shot.settings, link: '' },
  );
  return `${base.replace(/\/+$/, '')}/${flags.length > 0 ? `?${flags.join('&')}` : ''}${hash && `#${hash}`}`;
}
