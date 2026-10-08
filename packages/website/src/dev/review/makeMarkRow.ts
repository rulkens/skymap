import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';
import type { ReviewPanelActions } from './@types/ReviewPanelActions';
import type { ReviewRow } from './@types/ReviewRow';
import { makeNoteField } from './makeNoteField';

const STATES = ['cut', 'keep', 'rewrite', 'good'] as const;
const PASSAGE_CHARS = 90;

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

export function makeMarkRow(mark: DocsReviewMark, actions: ReviewPanelActions): ReviewRow {
  const el = div('review-row');
  el.dataset.reviewRow = mark.id;
  const head = div('review-row-head');
  const toggles = STATES.map((state) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'review-state';
    button.dataset.state = state;
    button.textContent = state;
    button.addEventListener('click', () => actions.setState(mark, state));
    return button;
  });
  const passage = document.createElement('button');
  passage.type = 'button';
  passage.className = 'review-row-text';
  passage.textContent =
    mark.text.length > PASSAGE_CHARS ? `${mark.text.slice(0, PASSAGE_CHARS)}…` : mark.text;
  passage.addEventListener('click', () => actions.go(mark));
  head.append(...toggles, passage);
  el.append(head);
  if (mark.reason !== 'owner') {
    const reason = div('review-row-reason');
    reason.textContent = mark.reason;
    el.append(reason);
  }
  const why = makeNoteField('Why? (optional)', '', (v) => actions.setNote(mark, 'why', v));
  const after = makeNoteField('Replace with', '', (v) => actions.setNote(mark, 'after', v));
  const how = makeNoteField('How to rewrite it', 'shorter; say where the switch is', (v) =>
    actions.setNote(mark, 'how', v),
  );
  const rewrite = div('review-row-rewrite');
  rewrite.append(after.el, how.el);
  el.append(why.el, rewrite);
  return {
    el,
    update(current) {
      toggles.forEach((t) =>
        t.setAttribute('aria-pressed', String(t.dataset.state === current.state)),
      );
      rewrite.hidden = current.state !== 'rewrite';
      why.set(current.why ?? '');
      after.set(current.after ?? current.text);
      how.set(current.how ?? '');
    },
    focus() {
      (mark.state === 'rewrite' ? after : why).area.focus({ preventScroll: true });
    },
  };
}
