import { SITE_LOOPS } from '../data/siteLoops';
import type { LoopSources } from '../@types/LoopSources';

const FILES = import.meta.glob<string>('../assets/loops/*.{webm,mp4}', {
  eager: true,
  query: '?url&no-inline',
  import: 'default',
});

/**
 * The committed files of one loop. An id that is not in the manifest, or a
 * row with no files yet, fails the build: `npm run site:loops` has not been
 * run since the row was added.
 */
export function loopSources(id: string): LoopSources {
  if (!SITE_LOOPS.some((loop) => loop.id === id)) {
    throw new Error(`Unknown loop id "${id}" (see src/data/siteLoops.ts)`);
  }
  const url = (ext: string) => {
    const file = FILES[`../assets/loops/${id}.${ext}`];
    if (!file) throw new Error(`No ${ext} for loop "${id}": run npm run site:loops`);
    return file;
  };
  return { webm: url('webm'), mp4: url('mp4') };
}
