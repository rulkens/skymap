import type { ReviewItem } from './@types/ReviewItem';
import type { ReviewPanel } from './@types/ReviewPanel';
import type { ReviewPanelActions } from './@types/ReviewPanelActions';
import type { ReviewRow } from './@types/ReviewRow';
import type { ReviewSection } from './@types/ReviewSection';
import { itemKey } from './itemKey';
import { makeMarkRow } from './makeMarkRow';
import { makeNoteRow } from './makeNoteRow';
import { placePanel } from './placePanel';

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

function button(label: string, className: string, parent: Element): HTMLButtonElement {
  const el = add('button', className, parent);
  el.type = 'button';
  el.textContent = label;
  return el;
}

/**
 * The review's one panel for a section, fixed beside the article so it never covers the
 * text its rows point at. `refresh` brings it in step with the marks and notes after every
 * render. `history` makes it the read-only list of what earlier applies carried out.
 */
export function openSectionPanel(
  section: ReviewSection,
  actions: ReviewPanelActions,
  history = false,
): ReviewPanel {
  const root = add('div', 'review-panel', document.body);
  root.dataset.reviewUi = '';
  // Focus moves in, so the next key goes to the panel's own controls and not to a control left behind.
  root.tabIndex = -1;
  const title = add('strong', 'review-panel-title', root);
  const words = add('div', 'review-panel-words', root);
  const list = add('div', 'review-panel-rows', root);
  const foot = add('div', 'review-panel-foot', root);
  const confirm = add('div', 'review-confirm', root);
  const confirmText = add('span', 'review-confirm-text', confirm);
  confirmText.setAttribute('role', 'status');
  const yes = button('Confirm', 'review-panel-action', confirm);
  const no = button('Cancel', 'review-panel-action', confirm);
  confirm.hidden = true;
  foot.hidden = history;
  words.hidden = history;
  for (const [label, state] of [
    ['Cut whole section', 'cut'],
    ['Section is good', 'good'],
  ] as const)
    button(label, 'review-panel-action', foot).addEventListener('click', () =>
      actions.whole(state),
    );
  const applyButton = button('Apply section', 'review-panel-action', foot);
  const showConfirm = (): void => {
    const { text, nothing } = actions.applyText();
    confirmText.textContent = text;
    yes.hidden = nothing;
    confirm.hidden = false;
    (nothing ? no : yes).focus();
  };
  const closeConfirm = (): void => {
    confirm.hidden = true;
    applyButton.focus();
  };
  applyButton.addEventListener('click', showConfirm);
  yes.addEventListener('click', () => {
    closeConfirm();
    actions.apply();
  });
  no.addEventListener('click', closeConfirm);
  let rows = new Map<string, ReviewRow>();
  const place = (): void => placePanel(root);
  place();
  addEventListener('resize', place);
  root.focus({ preventScroll: true });

  return {
    heading: section.heading,
    refresh(current, before, after) {
      title.textContent = current.title;
      words.textContent = `${before} → ${after} words`;
      applyButton.disabled = actions.applying();
      if (!confirm.hidden && !history) confirmText.textContent = actions.applyText().text;
      const keys = current.items.map(itemKey);
      if (keys.length !== rows.size || keys.some((key) => !rows.has(key))) {
        list.replaceChildren();
        rows = new Map(
          current.items.map((item: ReviewItem) => [
            itemKey(item),
            item.kind === 'mark'
              ? makeMarkRow(item.mark, actions, history)
              : makeNoteRow(item.note, item.el, actions),
          ]),
        );
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
    escape() {
      if (confirm.hidden) return false;
      closeConfirm();
      return true;
    },
    close() {
      removeEventListener('resize', place);
      root.remove();
    },
  };
}
