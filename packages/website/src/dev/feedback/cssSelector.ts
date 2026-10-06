const SAFE_NAME = /^[A-Za-z_][\w-]*$/;
const MAX_CLASSES = 2;

function segment(el: Element): string {
  const tag = el.localName;
  // Astro's scoped `astro-XXXX` classes change with the file's contents, so they would rot the selector.
  const classes = [...el.classList]
    .filter((c) => SAFE_NAME.test(c) && !c.startsWith('astro-'))
    .slice(0, MAX_CLASSES);
  const sameTag = el.parentElement
    ? [...el.parentElement.children].filter((s) => s.localName === tag)
    : [];
  const nth = sameTag.length > 1 ? `:nth-of-type(${sameTag.indexOf(el) + 1})` : '';
  return `${tag}${classes.map((c) => `.${c}`).join('')}${nth}`;
}

/**
 * A selector that matches `el` and nothing else in its document: its own id
 * when that is unique, otherwise the shortest chain of `tag.class:nth-of-type`
 * segments up the tree that is. Short, so an agent can read it, and built from
 * names the author wrote, so it survives a rebuild.
 */
export function cssSelector(el: Element): string {
  const doc = el.ownerDocument;
  const isUnique = (selector: string): boolean => {
    const found = doc.querySelectorAll(selector);
    return found.length === 1 && found[0] === el;
  };
  if (el.id && SAFE_NAME.test(el.id) && isUnique(`#${el.id}`)) return `#${el.id}`;
  const chain: string[] = [];
  for (let node: Element | null = el; node; node = node.parentElement) {
    chain.unshift(segment(node));
    const selector = chain.join(' > ');
    if (isUnique(selector) || node === doc.documentElement) return selector;
  }
  return chain.join(' > ');
}
