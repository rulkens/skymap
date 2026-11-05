import { shotLink } from './shotLink';

/** shotLink for a place whose link is the point (a lesson, an exhibit's name): a picture without one fails the build. */
export function requireShotLink(id: string): string {
  const link = shotLink(id);
  if (link === undefined) {
    throw new Error(
      `Shot "${id}" switches on a layer no link can (data/unlinkableLayers.ts); pick one that opens as shown`,
    );
  }
  return link;
}
