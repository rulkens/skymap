const BLOCK = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, dd, dt, figcaption, pre';

/** The nearest paragraph-like element around a node: what a mark that is "a whole paragraph" is set on. */
export function reviewBlockOf(node: Node | null): Element | null {
  return (node instanceof Element ? node : (node?.parentElement ?? null))?.closest(BLOCK) ?? null;
}
