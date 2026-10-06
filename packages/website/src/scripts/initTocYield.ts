/*
 * initTocYield — a docs page's own headings (layouts/Docs.astro) stay put in
 * the columns a wide picture runs into (components/DocFigure.astro). While one
 * is level with the list, the list is marked `data-under` and the layout hides
 * it. Without this script the picture passes over the list.
 */
export function initTocYield(toc: HTMLElement, pictures: readonly HTMLElement[]): void {
  const mark = () => {
    const list = toc.getBoundingClientRect();
    const under = pictures.some((picture) => {
      const box = picture.getBoundingClientRect();
      return box.bottom > list.top && box.top < list.bottom;
    });
    toc.toggleAttribute('data-under', under);
  };
  addEventListener('scroll', mark, { passive: true });
  addEventListener('resize', mark);
  mark();
}
