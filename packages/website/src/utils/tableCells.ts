/**
 * The cells of a table as Markdown compiles it, read back out of its HTML so
 * that DocTable can set them on the page grid: the heading row's cells and
 * each body row's, as the HTML inside them. A Markdown cell holds no table of
 * its own, so the first closing tag after a cell's opening one is its own.
 */
export function tableCells(html: string): { head: string[]; rows: string[][] } {
  const cells = (row: string) =>
    [...row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map((cell) => cell[1]!.trim());
  const [head = [], ...rows] = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    cells(row[1]!),
  );
  return { head, rows };
}
