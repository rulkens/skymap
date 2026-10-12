import { parseShotLink } from '../utils/shot/parseShotLink';
import { shotOutName } from '../utils/shot/shotOutName';

/** `npm run shot`'s naming with a `phone-` prefix, so desktop and phone shots of one link sort apart. */
export function phoneShotName(pageUrl: string, now: Date): string {
  const name = shotOutName({ link: parseShotLink(pageUrl), format: 'jpeg', now, taken: new Set() });
  return name.replace(/^data\/shots\//, 'data/shots/phone-');
}
