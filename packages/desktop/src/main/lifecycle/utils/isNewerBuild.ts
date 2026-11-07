/**
 * Whether a second launch, which passes `{ builtAt }` with its single-instance request, is a newer
 * build than this one. ISO times compare as strings; anything else (an old build sent nothing) is not.
 */
export function isNewerBuild(data: unknown, ours: string): boolean {
  if (typeof data !== 'object' || data === null || !('builtAt' in data)) return false;
  return typeof data.builtAt === 'string' && data.builtAt > ours;
}
