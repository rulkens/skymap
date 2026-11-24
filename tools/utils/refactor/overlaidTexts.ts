import type { Engine } from '../../@types/refactor/Engine';

/** The disk's project texts with the run's unwritten edits applied and its removed files dropped. */
export function overlaidTexts(
  disk: ReadonlyMap<string, string>,
  engine: Pick<Engine, 'overlay' | 'removed'>,
): ReadonlyMap<string, string> {
  const texts = new Map(disk);
  for (const file of engine.removed) texts.delete(file);
  for (const [file, text] of engine.overlay) texts.set(file, text);
  return texts;
}
