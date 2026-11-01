/**
 * The h2 and h3 texts of a built page's `<main>`, in page order, with tags stripped and entities
 * decoded. A nav or footer inside main is cut first: those headings belong to the site, not to the
 * page's structure. Regex, like the other built-HTML readers here: Astro's output is regular, and
 * jsdom has no type declarations in the tools project.
 */
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const decode = (text: string): string =>
  text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(\w+));/gi, (whole, hex, dec, name) =>
    hex || dec
      ? String.fromCodePoint(hex ? parseInt(hex, 16) : Number(dec))
      : (NAMED[name.toLowerCase()] ?? whole),
  );

export function mainHeadings(html: string): { h2: string[]; h3: string[] } {
  const main = /<main[\s>][\s\S]*?<\/main>/.exec(html)?.[0] ?? '';
  const own = main.replace(/<(nav|footer)[\s>][\s\S]*?<\/\1>/g, '');
  const texts = (tag: 'h2' | 'h3'): string[] =>
    [...own.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) =>
      decode(m[1]!.replace(/<[^>]*>/g, '')),
    );
  return { h2: texts('h2'), h3: texts('h3') };
}
