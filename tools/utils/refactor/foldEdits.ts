import type { TextEdit } from '../../@types/refactor/TextEdit';

/** Applies each file's edits back to front so earlier offsets stay valid. */
export function foldEdits(
  edits: readonly TextEdit[],
  read: (file: string) => string,
): ReadonlyMap<string, string> {
  const byFile = new Map<string, TextEdit[]>();
  for (const edit of edits) {
    const list = byFile.get(edit.file) ?? [];
    list.push(edit);
    byFile.set(edit.file, list);
  }
  const out = new Map<string, string>();
  for (const [file, list] of byFile) {
    // Duplicates are dropped: the same reference can arrive from two projects.
    const unique = [...new Map(list.map((e) => [`${e.start}:${e.end}:${e.text}`, e])).values()];
    unique.sort((a, b) => a.start - b.start || a.end - b.end);
    unique.forEach((edit, i) => {
      const prev = unique[i - 1];
      if (prev && edit.start < prev.end) {
        throw new Error(`overlapping edits in ${file} at offset ${edit.start}`);
      }
    });
    let text = read(file);
    for (const e of [...unique].reverse())
      text = text.slice(0, e.start) + e.text + text.slice(e.end);
    out.set(file, text);
  }
  return out;
}
