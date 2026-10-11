/**
 * A bullet of the licence record with each item of a list inside it made a
 * paragraph of its own, since the record's renderer knows paragraphs and
 * block quotes only. The list signs go; no word changes.
 */
export function recordParagraphs(markdown: string): string {
  let inList = false;
  return markdown
    .split('\n')
    .map((line) => {
      const item = /^- (.*)$/.exec(line);
      if (item) {
        inList = true;
        return `\n${item[1]}`;
      }
      // After a list, a line back at the bullet's own depth is the bullet's text again.
      if (inList && /^\S/.test(line)) {
        inList = false;
        return `\n${line}`;
      }
      return line;
    })
    .join('\n');
}
