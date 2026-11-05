// `<name>-<width>.<hash>.<ext>`, as shotFileName.ts names it.
const SHOT_FILE = /^(.+-\d+)\.[0-9a-f]{8}\.(avif|webp)$/;

/** A listing of the site's shot files keyed without the hash, `<name>-<width>.<ext>`; other files are left out. */
export function shotFileIndex(files: readonly string[]): Record<string, string> {
  const index: Record<string, string> = {};
  for (const file of files) {
    const match = SHOT_FILE.exec(file);
    if (match) index[`${match[1]}.${match[2]}`] = file;
  }
  return index;
}
