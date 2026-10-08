import type { ReviewItem } from './@types/ReviewItem';
import type { ReviewPanel } from './@types/ReviewPanel';
import type { ReviewPanelActions } from './@types/ReviewPanelActions';
import type { ReviewRow } from './@types/ReviewRow';
import type { ReviewSection } from './@types/ReviewSection';
import { itemKey } from './itemKey';
import { makeMarkRow } from './makeMarkRow';
import { makeNoteRow } from './makeNoteRow';

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

const rowOf = (item: ReviewItem, actions: ReviewPanelActions): ReviewRow =>
  item.kind === 'mark' ? makeMarkRow(item.mark, actions) : makeNoteRow(item.note, item.el, actions);

/**
 * The review's one panel for a section, fixed beside the article so it never covers the
 * text its rows point at. `refresh` brings it in step with the marks and notes after every render.
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
      const keys = current.items.map(itemKey);
      if (keys.length !== rows.size || keys.some((key) => !rows.has(key))) {
        list.replaceChildren();
        rows = new Map(current.items.map((item) => [itemKey(item), rowOf(item, actions)]));
        for (const key of keys) list.append(rows.get(key)!.el);
      }
      for (const item of current.items) rows.get(itemKey(item))!.update(item);
    },
    reveal(key, focus) {
      const row = rows.get(key);
      if (!row) return;
      row.el.scrollIntoView({ block: 'nearest' });
      if (focus) row.focus();
    },
    close: () => root.remove(),
  };
}
