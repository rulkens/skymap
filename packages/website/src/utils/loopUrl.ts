import { SITE_LOOPS } from '../data/siteLoops';

const FILES = import.meta.glob<string>('../assets/loops/*.mp4', {
  eager: true,
  query: '?url&no-inline',
  import: 'default',
});

/**
 * The address of one loop's committed file. An id that is not in the
 * manifest, or a row with no file yet, fails the build: `npm run site:loops`
 * has not been run since the row was added.
 */
export function loopUrl(id: string): string {
  if (!SITE_LOOPS.some((loop) => loop.id === id)) {
    throw new Error(`Unknown loop id "${id}" (see src/data/siteLoops.ts)`);
  }
  const file = FILES[`../assets/loops/${id}.mp4`];
  if (!file) throw new Error(`No file for loop "${id}": run npm run site:loops`);
  return file;
}
