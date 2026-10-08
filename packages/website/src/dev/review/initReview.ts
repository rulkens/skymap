/*
 * initReview — dev-only: when a cutter has written a review for this docs page
 * (tools/site/reviewPlugin.ts), its passages are marked in the article and a bar
 * above the page keeps the owner's rulings: click a mark to cycle its state, select
 * text and press c, w or g to add one, h to read the page as it would be after the cut.
 * A rewrite opens an editor for the owner's replacement wording, which h then shows;
 * a good passage opens one for the reason.
 * A click on a mark does not follow a link inside it: judging the text comes first.
 */
import type { DocsReview } from '../../../../../tools/site/@types/DocsReview';
import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';
import { clearMarks } from './clearMarks';
import type { ReviewEditorField } from './@types/ReviewEditorField';
import { openEditor } from './openEditor';
import { paintMark } from './paintMark';
import { placeAfter } from './placeAfter';
import './review.css';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const ROUTE = `${BASE}__review`;
const HIDE_KEY = 'skymap-review-hide-cut';
const NEXT_STATE = { cut: 'keep', keep: 'rewrite', rewrite: 'good', good: 'cut' } as const;

const wordsIn = (text: string): number => text.split(/\s+/).filter(Boolean).length;

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: Element,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

async function initReview(): Promise<void> {
  const article = document.getElementById('page');
  if (!article || !location.pathname.startsWith(`${BASE}docs/`)) return;
  const page = `/${location.pathname.slice(BASE.length)}`;
  const url = `${ROUTE}?page=${encodeURIComponent(page)}`;
  const found = await fetch(url).catch(() => null);
  if (!found?.ok) return;
  const review = (await found.json()) as DocsReview;

  const bar = make('div', 'review-bar', document.body);
  bar.dataset.reviewUi = '';
  make('strong', 'review-name', bar).textContent = 'Review';
  const job = make('input', 'review-job', bar);
  const words = make('span', 'review-words', bar);
  const counts = make('span', 'review-counts', bar);
  make('span', 'review-keys', bar).textContent =
    'click a mark: cut → keep → rewrite → good · select + C: cut · W: rewrite · G: good · H: hide cut text';
  const missing = make('span', 'review-missing', bar);
  const toggle = make('button', 'review-toggle', bar);
  const flag = make('span', 'review-flag', bar);
  job.value = review.job;
  job.setAttribute('aria-label', 'The question a reader comes to this page with');
  toggle.type = 'button';
  toggle.title = 'Hide cut text (H)';
  document.documentElement.classList.add('review-on');

  let hiding = false;
  try {
    hiding = sessionStorage.getItem(HIDE_KEY) === '1';
  } catch {
    /* private window: the toggle just starts off after a reload */
  }

  // The newest save goes last; a slower earlier request must not land on top of it.
  let queue: Promise<void> = Promise.resolve();
  function save(): void {
    flag.textContent = 'saving…';
    queue = queue.then(async () => {
      try {
        const res = await fetch(url, { method: 'PUT', body: JSON.stringify(review) });
        if (!res.ok) throw new Error(String(res.status));
        flag.textContent = 'saved';
        flag.classList.remove('error');
      } catch {
        flag.textContent = 'save failed';
        flag.classList.add('error');
      }
    });
  }

  function render(): void {
    clearMarks(article!);
    const notFound = review.marks
      .filter((mark) => !paintMark(article!, mark))
      .map((mark) => mark.id);
    placeAfter(article!, review.marks);
    const count = (state: DocsReviewMark['state']): number =>
      review.marks.filter((mark) => mark.state === state).length;
    const cutWords = review.marks
      .filter((mark) => mark.state === 'cut')
      .reduce((sum, mark) => sum + wordsIn(mark.text), 0);
    words.textContent = `${review.words.before} → ${review.words.before - cutWords} words`;
    counts.textContent = `${count('cut')} cut · ${count('keep')} keep · ${count('rewrite')} rewrite · ${count('good')} good`;
    missing.textContent = notFound.map((id) => `not found: ${id}`).join(', ');
    document.documentElement.classList.toggle('review-hiding', hiding);
    toggle.textContent = hiding ? 'Show cut text (H)' : 'Hide cut text (H)';
    toggle.setAttribute('aria-pressed', String(hiding));
  }

  function setHiding(next: boolean): void {
    hiding = next;
    try {
      sessionStorage.setItem(HIDE_KEY, next ? '1' : '0');
    } catch {
      /* private window */
    }
    render();
  }

  let closeEditor = (): void => {};
  // A rewrite is asked for its replacement and instruction (`how` is its reason), every other state for its optional `why`.
  function editNotes(mark: DocsReviewMark): void {
    closeEditor();
    const painted = article!.querySelectorAll(
      `.review-mark[data-review-id="${CSS.escape(mark.id)}"]`,
    );
    const last = painted[painted.length - 1];
    if (!last) return;
    const fields: ReviewEditorField[] =
      mark.state === 'rewrite'
        ? [
            { label: 'Replace with', value: mark.after ?? mark.text, placeholder: '' },
            {
              label: 'How to rewrite it',
              value: mark.how ?? '',
              placeholder: 'shorter; say where the switch is',
            },
          ]
        : [
            {
              label: 'Why? (optional)',
              value: mark.why ?? '',
              placeholder: `why this is ${mark.state}`,
            },
          ];
    closeEditor = openEditor(last, fields, (values) => {
      closeEditor();
      if (!values) return;
      const [first = '', second = ''] = values;
      if (mark.state === 'rewrite') {
        // The field starts as the passage itself: saving it untouched is not a replacement.
        if (first && first !== mark.text) mark.after = first;
        else delete mark.after;
        if (second) mark.how = second;
        else delete mark.how;
      } else if (first) mark.why = first;
      else delete mark.why;
      render();
      save();
    });
  }

  function addMark(state: DocsReviewMark['state']): void {
    const selection = getSelection();
    const range = selection && !selection.isCollapsed ? selection.getRangeAt(0) : null;
    if (!range || !article!.contains(range.commonAncestorContainer)) return;
    const text = selection!.toString().replace(/\s+/g, ' ').trim();
    if (!text) return;
    const taken = review.marks.map((mark) => Number(/^owner-(\d+)$/.exec(mark.id)?.[1] ?? 0));
    const mark: DocsReviewMark = {
      id: `owner-${Math.max(0, ...taken) + 1}`,
      text,
      reason: 'owner',
      state,
    };
    review.marks.push(mark);
    selection!.removeAllRanges();
    closeEditor();
    render();
    save();
    editNotes(mark);
  }

  // A click anywhere else skips the editor (keeping what is stored); capture, so a click on a mark can open its own.
  document.addEventListener(
    'click',
    (e) => {
      if (!(e.target as Element).closest('.review-editor')) closeEditor();
    },
    true,
  );
  article.addEventListener('click', (e) => {
    if (!getSelection()?.isCollapsed) return;
    const target = e.target as Element;
    const pencil = target.closest<HTMLElement>('.review-pencil');
    const id = (pencil ?? target.closest<HTMLElement>('.review-mark'))?.dataset.reviewId;
    const mark = review.marks.find((m) => m.id === id);
    if (!mark) return;
    e.preventDefault();
    if (pencil) return editNotes(mark);
    closeEditor();
    mark.state = NEXT_STATE[mark.state];
    render();
    save();
    editNotes(mark);
  });
  job.addEventListener('change', () => {
    review.job = job.value;
    save();
  });
  job.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') job.blur();
  });
  toggle.addEventListener('click', () => setHiding(!hiding));
  document.addEventListener('keydown', (e) => {
    const typing = !!(e.target as HTMLElement | null)?.closest(
      'input, textarea, select, [contenteditable]',
    );
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'h') setHiding(!hiding);
    else if (key === 'c') addMark('cut');
    else if (key === 'w') addMark('rewrite');
    else if (key === 'g') addMark('good');
  });

  render();
}

void initReview();
