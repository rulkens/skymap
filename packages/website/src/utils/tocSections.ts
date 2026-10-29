import type { MarkdownHeading } from 'astro';

// A shorter page is read in less time than its list of headings would take to scan.
const TOC_FROM = 4;

/** The second-level headings a docs page lists as its own sections: none under four, since the list would be longer than the page. */
export function tocSections(headings: readonly MarkdownHeading[]): MarkdownHeading[] {
  const all = headings.filter((heading) => heading.depth === 2);
  return all.length >= TOC_FROM ? all : [];
}
