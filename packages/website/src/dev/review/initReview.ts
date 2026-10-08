/*
 * initReview — dev-only: when a cutter has written a review for this docs page
 * (tools/site/reviewPlugin.ts), its passages are marked in the article and a bar
 * above the page keeps the owner's rulings: click a mark to cycle its state, select
 * text and press c or w to add one, h to read the page as it would be after the cut.
 * A click on a mark does not follow a link inside it: judging the text comes first.
 */
import type { DocsReview } from '../../../../../tools/site/@types/DocsReview';
import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';
import { clearMarks } from './clearMarks';
import { paintMark } from './paintMark';
import './review.css';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const ROUTE = `${BASE}__review`;
const HIDE_KEY = 'skymap-review-hide-cut';
const NEXT_STATE = { cut: 'keep', keep: 'rewrite', rewrite: 'cut' } as const;

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
    const count = (state: DocsReviewMark['state']): number =>
      review.marks.filter((mark) => mark.state === state).length;
    const cutWords = review.marks
      .filter((mark) => mark.state === 'cut')
      .reduce((sum, mark) => sum + wordsIn(mark.text), 0);
    words.textContent = `${review.words.before} → ${review.words.before - cutWords} words`;
    counts.textContent = `${count('cut')} cut · ${count('keep')} keep · ${count('rewrite')} rewrite`;
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

  function addMark(state: DocsReviewMark['state']): void {
    const selection = getSelection();
    const range = selection && !selection.isCollapsed ? selection.getRangeAt(0) : null;
    if (!range || !article!.contains(range.commonAncestorContainer)) return;
    const text = selection!.toString().replace(/\s+/g, ' ').trim();
    if (!text) return;
    const taken = review.marks.map((mark) => Number(/^owner-(\d+)$/.exec(mark.id)?.[1] ?? 0));
    review.marks.push({ id: `owner-${Math.max(0, ...taken) + 1}`, text, reason: 'owner', state });
    selection!.removeAllRanges();
    render();
    save();
  }

  article.addEventListener('click', (e) => {
    if (!getSelection()?.isCollapsed) return;
    const id = (e.target as Element).closest<HTMLElement>('.review-mark')?.dataset.reviewId;
    const mark = review.marks.find((m) => m.id === id);
    if (!mark) return;
    e.preventDefault();
    mark.state = NEXT_STATE[mark.state];
    render();
    save();
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
  });

  render();
}

void initReview();
