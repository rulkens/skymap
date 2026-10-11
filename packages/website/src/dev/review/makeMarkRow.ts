import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';
import type { ReviewPanelActions } from './@types/ReviewPanelActions';
import type { ReviewRow } from './@types/ReviewRow';
import { makeNoteField } from './makeNoteField';

const STATES = ['cut', 'keep', 'rewrite', 'good'] as const;
const PASSAGE_CHARS = 90;
// The one rewrite field edits one of these at a time; the control above it names which.
const KINDS = [
  {
    key: 'how',
    segment: 'Note for the rewriter',
    save: 'Save note',
    hint: 'shorter; say where the switch is',
  },
  { key: 'after', segment: 'Replacement text', save: 'Save replacement', hint: '' },
] as const;

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

export function makeMarkRow(
  mark: DocsReviewMark,
  actions: ReviewPanelActions,
  readOnly = false,
): ReviewRow {
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

  const why = makeNoteField('Why? (optional)', '', 'Save why', (v) =>
    actions.setNote(mark, 'why', v),
  );
  let kind: (typeof KINDS)[number] = KINDS[0];
  const rewrite = div('review-row-rewrite');
  const segments = div('review-segment');
  const field = makeNoteField('', '', KINDS[0].save, (v) => actions.setNote(mark, kind.key, v));
  const shown = (): string => (kind.key === 'how' ? (mark.how ?? '') : (mark.after ?? mark.text));
  const buttons = KINDS.map((k) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = k.segment;
    button.addEventListener('click', () => {
      kind = k;
      field.set(shown());
      sync();
    });
    segments.append(button);
    return button;
  });
  // What the owner has written, as labelled lines, so no value hides behind the control.
  const given = div('review-row-given');
  const noteLine = div('review-row-line');
  const replacementLine = div('review-row-line');
  given.append(noteLine, replacementLine);
  rewrite.append(segments, field.el, given);
  el.append(why.el, rewrite);
  // History: what an apply carried out is shown as it was ruled, greyed and not editable.
  if (readOnly) {
    el.classList.add('review-row-applied');
    for (const control of el.querySelectorAll('button, textarea')) {
      (control as HTMLButtonElement | HTMLTextAreaElement).disabled = true;
    }
  }

  function sync(): void {
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(KINDS[i] === kind)));
    field.area.placeholder = kind.hint;
    field.area.setAttribute('aria-label', kind.segment);
    field.button.textContent = kind.save;
    noteLine.hidden = !mark.how;
    noteLine.textContent = mark.how ? `Note: ${mark.how}` : '';
    replacementLine.hidden = !mark.after;
    replacementLine.textContent = mark.after ? `Replacement: ${mark.after}` : '';
  }

  return {
    el,
    update(item) {
      if (item.kind !== 'mark') return;
      const current = item.mark;
      toggles.forEach((t) =>
        t.setAttribute('aria-pressed', String(t.dataset.state === current.state)),
      );
      rewrite.hidden = current.state !== 'rewrite';
      why.set(current.why ?? '');
      field.set(shown());
      sync();
    },
    focus() {
      (mark.state === 'rewrite' ? field : why).area.focus({ preventScroll: true });
    },
  };
}
