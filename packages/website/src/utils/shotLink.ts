import { siteShot } from '../data/siteShot';
import { shotHash } from './shotHash';

/** The app link that opens what shot `id` shows (shotHash), for a component to print or open. */
export function shotLink(id: string): string {
  return shotHash(siteShot(id));
}
