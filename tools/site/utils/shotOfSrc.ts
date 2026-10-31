// `<id>-<width>.avif`, as shootSiteShots.ts names it; a build adds an 8-character hash before the extension.
const SHOT_FILE = /^(.+)-(\d+)(?:\.[\w-]{8})?\.(?:avif|webp)$/;

/**
 * The shot id and file width a picture's `currentSrc` names, or `null` for a file not named like a
 * site shot. The caller checks the id against the manifest: other assets share the naming.
 */
export function shotOfSrc(src: string): { id: string; width: number } | null {
  if (!src) return null;
  const file = decodeURIComponent(new URL(src, 'http://localhost').pathname).split('/').pop()!;
  const match = SHOT_FILE.exec(file);
  return match ? { id: match[1]!, width: Number(match[2]) } : null;
}
