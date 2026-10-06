import type { FeedbackElement } from '../../../../../tools/site/@types/FeedbackElement';
import { cssSelector } from './cssSelector';

const TEXT_MAX = 200;
const HEADINGS = 'h1,h2,h3,h4,h5,h6';

const squash = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ').trim();

function nearestHeading(el: Element): string | null {
  const inside = el.matches(HEADINGS) ? el : el.querySelector(HEADINGS);
  const before = [...el.ownerDocument.querySelectorAll(HEADINGS)].filter(
    (h) => h !== el && h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
  // The last heading above the element is the section it sits in; one inside it is the fallback.
  const found = before.at(-1) ?? inside;
  return found ? squash(found.textContent) || null : null;
}

// The dev build tags elements written in .astro templates with their file and `line:column`;
// elements made by a script have none, so the nearest tagged ancestor stands in.
function astroSource(el: Element): FeedbackElement['source'] {
  // Copied by DevFeedback.astro's inline script, because the dev toolbar removes the attributes.
  const copied = (window as unknown as { __feedbackSources?: WeakMap<Element, [string, string]> })
    .__feedbackSources;
  for (let node: Element | null = el; node; node = node.parentElement) {
    const [file, loc] = copied?.get(node) ?? [
      node.getAttribute('data-astro-source-file'),
      node.getAttribute('data-astro-source-loc'),
    ];
    if (file && loc) return { file, loc, inherited: node !== el };
  }
  return null;
}

/** What an agent needs to find `el` again and open the file that wrote it. */
export function describeElement(el: Element): FeedbackElement {
  return {
    selector: cssSelector(el),
    tag: el.localName,
    id: el.id || null,
    classes: [...el.classList],
    heading: nearestHeading(el),
    text: squash(el.textContent).slice(0, TEXT_MAX),
    source: astroSource(el),
  };
}
