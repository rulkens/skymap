/*
 * initSectionMark — marks, in a docs page's lists of its own sections
 * (components/PageSections.astro), the link of the section being read: the
 * last heading that has passed the upper third of the window. One read of the
 * headings' boxes per scroll event and no write unless the section changes.
 */
export function initSectionMark(links: readonly HTMLAnchorElement[]): void {
  const heads = [...new Set(links.map((link) => decodeURIComponent(link.hash.slice(1))))]
    .map((id) => document.getElementById(id))
    .filter((head) => head !== null);
  let marked: string | undefined;

  const mark = () => {
    const line = innerHeight / 3;
    const here = heads.findLast((head) => head.getBoundingClientRect().top <= line)?.id;
    if (here === marked) return;
    marked = here;
    for (const link of links) {
      if (decodeURIComponent(link.hash.slice(1)) === here)
        link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  };
  addEventListener('scroll', mark, { passive: true });
  mark();
}
