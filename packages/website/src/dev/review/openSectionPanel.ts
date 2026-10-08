import type { ReviewPanel } from './@types/ReviewPanel';
import type { ReviewPanelActions } from './@types/ReviewPanelActions';
import type { ReviewRow } from './@types/ReviewRow';
import type { ReviewSection } from './@types/ReviewSection';
import { makeMarkRow } from './makeMarkRow';

function add<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: Element,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  parent.append(el);
  return el;
}

/**
 * The review's one panel for a section, fixed beside the article so it never covers the
 * text its rows point at. `refresh` brings it in step with the marks after every render.
 */
export function openSectionPanel(section: ReviewSection, actions: ReviewPanelActions): ReviewPanel {
  const root = add('div', 'review-panel', document.body);
  root.dataset.reviewUi = '';
  const title = add('strong', 'review-panel-title', root);
  const words = add('div', 'review-panel-words', root);
  const list = add('div', 'review-panel-rows', root);
  const foot = add('div', 'review-panel-foot', root);
  for (const [label, state] of [
    ['Cut whole section', 'cut'],
    ['Section is good', 'good'],
  ] as const) {
    const button = add('button', 'review-panel-action', foot);
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => actions.whole(state));
  }
  let rows = new Map<string, ReviewRow>();

  return {
    heading: section.heading,
    refresh(current, before, after) {
      title.textContent = current.title;
      words.textContent = `${before} → ${after} words`;
      const same =
        current.marks.length === rows.size && current.marks.every((mark) => rows.has(mark.id));
      if (!same) {
        list.replaceChildren();
        rows = new Map(current.marks.map((mark) => [mark.id, makeMarkRow(mark, actions)]));
        for (const row of rows.values()) list.append(row.el);
      }
      for (const mark of current.marks) rows.get(mark.id)!.update(mark);
    },
    reveal(id, focus) {
      const row = rows.get(id);
      if (!row) return;
      row.el.scrollIntoView({ block: 'nearest' });
      if (focus) row.focus();
    },
    close: () => root.remove(),
  };
}
