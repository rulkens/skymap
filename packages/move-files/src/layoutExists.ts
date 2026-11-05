import type { ProjectSnapshot } from './@types/ProjectSnapshot';

/**
 * Whether a file exists once `moves` (absolute from -> to) are applied; an empty
 * map gives the current layout. Rewrite and guard both ask through here so they
 * cannot disagree about what a path means.
 */
export function layoutExists(
  snapshot: Pick<ProjectSnapshot, 'texts' | 'fileExists'>,
  moves: ReadonlyMap<string, string>,
): (path: string) => boolean {
  const destinations = new Set(moves.values());
  return (path) =>
    destinations.has(path) ||
    (!moves.has(path) && (snapshot.texts.has(path) || snapshot.fileExists(path)));
}
