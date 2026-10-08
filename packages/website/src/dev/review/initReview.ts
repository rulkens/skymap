/*
 * initReview — dev-only, a part of the overlay `f` turns on (../overlay/devOverlay.ts): when
 * a cutter has written a review for this docs page (tools/site/reviewPlugin.ts), the article
 * reads as plain text and each reviewed heading carries an icon that opens that section's
 * panel: its marks, the feedback notes inside it, the owner's notes. Select text and press
 * c, w or g to add a mark; m shows the marks in the text (click one to cycle its state); h
 * flips between the original and the result.
 */
import type { DocsReview } from '../../../../../tools/site/@types/DocsReview';
import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';
import { devOverlay } from '../overlay/devOverlay';
import { make } from '../overlay/make';
import { overlayKeys } from '../overlay/overlayKeys';
import { pageNotes } from '../overlay/pageNotes';
import type { ReviewPanel } from './@types/ReviewPanel';
import type { ReviewPanelActions } from './@types/ReviewPanelActions';
import type { ReviewSection } from './@types/ReviewSection';
import { clearMarks } from './clearMarks';
import { flashMark } from './flashMark';
import { locateNotes } from './locateNotes';
import { openSectionPanel } from './openSectionPanel';
import { paintMark } from './paintMark';
import { placeAfter } from './placeAfter';
import { placeSectionIcons } from './placeSectionIcons';
import { sectionsOf } from './sectionsOf';
import { sectionText } from './sectionText';
import { setNote } from './setNote';
import './review.css';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const ROUTE = `${BASE}__review`;
const HIDE_KEY = 'skymap-review-hide-cut';
const NEXT_STATE = { cut: 'keep', keep: 'rewrite', rewrite: 'good', good: 'cut' } as const;

const wordsIn = (text: string): number => text.split(/\s+/).filter(Boolean).length;

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
  bar.hidden = true;
  make('strong', 'review-name', bar).textContent = 'Review';
  const job = make('input', 'review-job', bar);
  const words = make('span', 'review-words', bar);
  const counts = make('span', 'review-counts', bar);
  make('span', 'review-keys', bar).textContent = overlayKeys(true);
  const missing = make('span', 'review-missing', bar);
  const toggle = make('button', 'review-toggle', bar);
  const flag = make('span', 'review-flag', bar);
  job.value = review.job;
  job.setAttribute('aria-label', 'The question a reader comes to this page with');
  toggle.type = 'button';
  toggle.title = 'Show the result: cut passages gone, rewrites in place (H)';

  let hiding = false;
  try {
    hiding = sessionStorage.getItem(HIDE_KEY) === '1';
  } catch {
    /* private window: the toggle just starts off after a reload */
  }
  let active = devOverlay.isOn();
  let marksShown = false;
  let sections: ReviewSection[] = [];
  let panel: ReviewPanel | null = null;
  let swallowClick = false;

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

  function closePanel(): void {
    panel?.close();
    panel = null;
  }

  function refreshPanel(): void {
    if (!panel) return;
    const section = sections.find((s) => s.heading === panel!.heading);
    if (!section) return closePanel();
    const before = wordsIn(sectionText(article!, section));
    const cut = section.items
      .filter((item) => item.kind === 'mark' && item.mark.state === 'cut')
      .reduce((sum, item) => sum + (item.kind === 'mark' ? wordsIn(item.mark.text) : 0), 0);
    panel.refresh(section, before, before - cut);
  }

  function render(): void {
    clearMarks(article!);
    const root = document.documentElement;
    root.classList.toggle('review-on', active);
    root.classList.toggle('review-hiding', active && hiding);
    root.classList.toggle('review-marks', active && marksShown);
    bar.hidden = !active;
    if (!active) {
      sections = [];
      return closePanel();
    }
    const notFound = review.marks
      .filter((mark) => !paintMark(article!, mark))
      .map((mark) => mark.id);
    // Notes are found by selectors that count siblings: before the replacements are added.
    const noteEls = locateNotes(article!, pageNotes.list());
    placeAfter(article!, review.marks);
    sections = sectionsOf(article!, review.marks, pageNotes.list(), noteEls);
    placeSectionIcons(sections);
    // The marks are painted either way (the panel finds its passages by them); unshown, they leave no trace, tooltips included.
    if (!marksShown)
      for (const el of article!.querySelectorAll('.review-mark')) el.removeAttribute('title');
    const count = (state: DocsReviewMark['state']): number =>
      review.marks.filter((mark) => mark.state === state).length;
    const cutWords = review.marks
      .filter((mark) => mark.state === 'cut')
      .reduce((sum, mark) => sum + wordsIn(mark.text), 0);
    words.textContent = `${review.words.before} → ${review.words.before - cutWords} words`;
    counts.textContent = `${count('cut')} cut · ${count('keep')} keep · ${count('rewrite')} rewrite · ${count('good')} good`;
    missing.textContent = notFound.map((id) => `not found: ${id}`).join(', ');
    toggle.textContent = hiding ? 'Show original (H)' : 'Show result (H)';
    toggle.setAttribute('aria-pressed', String(hiding));
    refreshPanel();
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

  // An item in an h3 is listed by the h3 as well as the h2 around it: the panel opens on the nearest.
  const sectionOfMark = (mark: DocsReviewMark): ReviewSection | undefined =>
    [...sections].reverse().find((s) => s.items.some((i) => i.kind === 'mark' && i.mark === mark));

  function openPanel(section: ReviewSection, key?: string, focus = false): void {
    if (panel?.heading !== section.heading) {
      closePanel();
      panel = openSectionPanel(section, actions);
    }
    refreshPanel();
    if (key) panel.reveal(key, focus);
  }

  const actions: ReviewPanelActions = {
    setState(mark, state) {
      mark.state = state;
      render();
      save();
    },
    setNote(mark, key, value) {
      setNote(mark, key, value);
      render();
      save();
    },
    go: (target) =>
      flashMark(
        target instanceof Element
          ? [target]
          : [
              ...article!.querySelectorAll(
                `.review-mark[data-review-id="${CSS.escape(target.id)}"]`,
              ),
            ],
      ),
    deleteNote: (id) => void pageNotes.remove(id).catch((e: unknown) => console.error(e)),
    whole(state) {
      const section = sections.find((s) => s.heading === panel?.heading);
      if (!section) return;
      const mark = pushOwnerMark(sectionText(article!, section), state);
      render();
      save();
      panel?.reveal(`mark:${mark.id}`, true);
    },
  };

  function pushOwnerMark(text: string, state: DocsReviewMark['state']): DocsReviewMark {
    const taken = review.marks.map((mark) => Number(/^owner-(\d+)$/.exec(mark.id)?.[1] ?? 0));
    const mark: DocsReviewMark = {
      id: `owner-${Math.max(0, ...taken) + 1}`,
      text,
      reason: 'owner',
      state,
    };
    review.marks.push(mark);
    return mark;
  }

  function addMark(state: DocsReviewMark['state']): void {
    const selection = getSelection();
    const range = selection && !selection.isCollapsed ? selection.getRangeAt(0) : null;
    if (!range || !article!.contains(range.commonAncestorContainer)) return;
    const text = selection!.toString().replace(/\s+/g, ' ').trim();
    if (!text) return;
    const mark = pushOwnerMark(text, state);
    selection!.removeAllRanges();
    render();
    save();
    const section = sectionOfMark(mark);
    if (section) openPanel(section, `mark:${mark.id}`, true);
  }

  devOverlay.subscribe((on) => {
    active = on;
    render();
  });
  pageNotes.subscribe(() => active && render());
  void pageNotes.refresh().catch(() => {
    /* server restarting: the notes come with the next focus */
  });
  devOverlay.onEscape((e) => {
    // A field's own Escape drops its edit; the panel stays for the next one.
    if ((e.target as Element | null)?.closest('.review-panel textarea')) return true;
    if (!panel) return false;
    closePanel();
    return true;
  });
  // The capture layer sits over the article: an icon under a press opens its panel from here.
  devOverlay.onPress((x, y) => {
    const icon = document
      .elementsFromPoint(x, y)
      .find((el) => el.classList.contains('review-section-icon'));
    if (!icon) return false;
    (icon as HTMLElement).click();
    // The click that ends this press lands on the capture layer and must not close what it opened.
    swallowClick = true;
    return true;
  });
  // Holding Shift lets the pointer through the capture layer, so text can be selected for a mark.
  const letThrough = (e: KeyboardEvent): void => {
    document.documentElement.classList.toggle('review-select', active && e.shiftKey);
  };
  addEventListener('keydown', letThrough, true);
  addEventListener('keyup', letThrough, true);

  // A click anywhere but the panel and its icons closes it; capture, so a click that opens one is not undone.
  document.addEventListener(
    'click',
    (e) => {
      if (swallowClick) {
        swallowClick = false;
        return;
      }
      if (!(e.target as Element).closest('.review-panel, .review-section-icon')) closePanel();
    },
    true,
  );
  article.addEventListener('click', (e) => {
    const target = e.target as Element;
    const icon = target.closest<HTMLElement>('.review-section-icon');
    if (icon) {
      e.preventDefault();
      const section = sections[Number(icon.dataset.reviewSection)];
      if (!section) return;
      if (panel?.heading === section.heading) closePanel();
      else openPanel(section);
      return;
    }
    if (!marksShown || !getSelection()?.isCollapsed) return;
    const id = target.closest<HTMLElement>('.review-mark')?.dataset.reviewId;
    const mark = review.marks.find((m) => m.id === id);
    if (!mark) return;
    e.preventDefault();
    mark.state = NEXT_STATE[mark.state];
    render();
    save();
    const section = sectionOfMark(mark);
    if (section) openPanel(section, `mark:${mark.id}`);
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
    if (!active || typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'h') setHiding(!hiding);
    else if (key === 'm') {
      marksShown = !marksShown;
      render();
    } else if (key === 'c') addMark('cut');
    else if (key === 'w') addMark('rewrite');
    else if (key === 'g') addMark('good');
  });

  render();
}

void initReview();
