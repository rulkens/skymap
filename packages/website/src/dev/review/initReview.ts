/*
 * initReview — dev-only, a part of the overlay `f` turns on (../overlay/devOverlay.ts): when
 * on any page (tools/site/reviewPlugin.ts keeps a file per page, empty until the first mark),
 * the article or main region reads as plain text and each reviewed heading carries an icon that opens that section's
 * panel: its marks, the feedback notes inside it, the owner's notes. Select text and press
 * c, w or g to add a mark; m shows the marks in the text (click one to cycle its state); h
 * flips between the original and the result. The keys are listed in a box the bar's Keys button
 * (or ?) opens; it starts open the first time the overlay is on in a browser.
 */
import type { DocsReview } from '../../../../../tools/site/@types/DocsReview';
import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';
import { devOverlay } from '../overlay/devOverlay';
import { make } from '../overlay/make';
import { pageNotes } from '../overlay/pageNotes';
import type { ReviewPanel } from './@types/ReviewPanel';
import type { ReviewPanelActions } from './@types/ReviewPanelActions';
import type { ReviewSection } from './@types/ReviewSection';
import { clearMarks } from './clearMarks';
import { describeApply } from './describeApply';
import { flashMark } from './flashMark';
import { locateNotes } from './locateNotes';
import { makeKeysHelp } from './makeKeysHelp';
import { openSectionPanel } from './openSectionPanel';
import { paintMark } from './paintMark';
import { placeAfter } from './placeAfter';
import { placeSectionIcons } from './placeSectionIcons';
import { sectionsOf } from './sectionsOf';
import { sectionText } from './sectionText';
import { setNote } from './setNote';
import { wordsAfter } from './wordsAfter';
import { wordsIn } from './wordsIn';
import './review.css';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const ROUTE = `${BASE}__review`;
const HIDE_KEY = 'skymap-review-hide-cut';
const HELP_SEEN_KEY = 'skymap-review-keys-seen';
const NEXT_STATE = { cut: 'keep', keep: 'rewrite', rewrite: 'good', good: 'cut' } as const;

const APPLY_POLL_MS = 3000;

async function initReview(): Promise<void> {
  const article = document.getElementById('page') ?? document.getElementById('main');
  if (!article) return;
  const page = `/${location.pathname.slice(BASE.length)}`;
  const url = `${ROUTE}?page=${encodeURIComponent(page)}`;
  const found = await fetch(url).catch(() => null);
  // No cutter has been here: the page starts from an empty review, and the first save writes its file.
  if (found?.status !== 200 && found?.status !== 404) return;
  const review: DocsReview = found.ok
    ? ((await found.json()) as DocsReview)
    : { page, job: '', words: { before: wordsIn(article.textContent ?? '') }, marks: [] };

  const bar = make('div', 'review-bar', document.body);
  bar.dataset.reviewUi = '';
  bar.hidden = true;
  make('strong', 'review-name', bar).textContent = 'Review';
  const job = make('input', 'review-job', bar);
  const words = make('span', 'review-words', bar);
  const counts = make('span', 'review-counts', bar);
  const keysButton = make('button', 'review-bar-button review-keys-button', bar);
  const help = makeKeysHelp(bar);
  const confirm = make('span', 'review-confirm-bar', bar);
  const confirmText = make('span', 'review-confirm-text', confirm);
  const yes = make('button', 'review-bar-button', confirm);
  const no = make('button', 'review-bar-button', confirm);
  const missing = make('span', 'review-missing', bar);
  const applyButton = make('button', 'review-bar-button', bar);
  const applyState = make('button', 'review-bar-button review-apply-state', bar);
  const cancelApply = make('button', 'review-bar-button', bar);
  const toggle = make('button', 'review-toggle', bar);
  const flag = make('span', 'review-flag', bar);
  job.value = review.job;
  job.setAttribute('aria-label', 'The question a reader comes to this page with');
  job.placeholder = 'The question a reader comes to this page with';
  confirm.hidden = true;
  confirmText.setAttribute('role', 'status');
  for (const [button, label] of [
    [yes, 'Confirm'],
    [no, 'Cancel'],
    [applyButton, 'Apply page'],
    [cancelApply, 'Cancel apply'],
    [keysButton, 'Keys (?)'],
    [toggle, ''],
    [applyState, ''],
  ] as const) {
    button.type = 'button';
    if (label) button.textContent = label;
  }
  keysButton.setAttribute('aria-controls', help.id);
  keysButton.setAttribute('aria-expanded', 'false');
  toggle.title = 'Show the result: cut passages gone, rewrites in place (H)';
  // The bar wraps on a narrow screen: the page is pushed down by what it measures, not by a guess.
  new ResizeObserver(() =>
    document.documentElement.style.setProperty(
      '--review-bar',
      `${Math.ceil(bar.getBoundingClientRect().height)}px`,
    ),
  ).observe(bar);

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

  // The box and a section panel share the corner, so only one is open at a time.
  function setHelp(open: boolean, focus = false): void {
    if (open) closePanel();
    const hadFocus = help.contains(document.activeElement);
    help.hidden = !open;
    keysButton.setAttribute('aria-expanded', String(open));
    if (open && focus) help.focus();
    else if (!open && hadFocus) keysButton.focus();
  }
  // Open the first time the overlay is turned on in this browser, closed after that until asked for.
  function introduceKeys(): void {
    try {
      if (localStorage.getItem(HELP_SEEN_KEY)) return;
      localStorage.setItem(HELP_SEEN_KEY, '1');
    } catch {
      return;
    }
    setHelp(true);
  }

  // What earlier applies carried out is history: out of the text, the counts and the section panels.
  const appliedIds = (): Set<string> =>
    new Set((review.applied ?? []).flatMap((entry) => entry.markIds));
  const liveMarks = (): DocsReviewMark[] => review.marks.filter((m) => !appliedIds().has(m.id));
  // The page's words now: the cutter's count less what applies took out, which is the last apply's "after".
  const liveBefore = (): number =>
    wordsAfter(
      review.marks.filter((m) => appliedIds().has(m.id)),
      review.words.before,
    );
  const historySection = (): ReviewSection => ({
    heading: applyState,
    start: applyState,
    end: null,
    title: 'Applied',
    items: review.marks
      .filter((m) => appliedIds().has(m.id))
      .map((mark) => ({ kind: 'mark' as const, mark })),
  });
  const openSectionOf = (): ReviewSection | undefined =>
    sections.find((s) => s.heading === panel?.heading);
  const marksOf = (section: ReviewSection): DocsReviewMark[] =>
    section.items.flatMap((item) => (item.kind === 'mark' ? [item.mark] : []));

  function refreshPanel(): void {
    if (!panel) return;
    if (panel.heading === applyState) return panel.refresh(historySection(), 0, 0);
    const section = openSectionOf();
    if (!section) return closePanel();
    const before = wordsIn(sectionText(article!, section));
    panel.refresh(section, before, wordsAfter(marksOf(section), before));
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
      setHelp(false);
      return closePanel();
    }
    const live = liveMarks();
    const notFound = live.filter((mark) => !paintMark(article!, mark)).map((mark) => mark.id);
    // Notes are found by selectors that count siblings: before the replacements are added.
    const noteEls = locateNotes(article!, pageNotes.list());
    placeAfter(article!, live);
    sections = sectionsOf(article!, live, pageNotes.list(), noteEls);
    placeSectionIcons(sections);
    // The marks are painted either way (the panel finds its passages by them); unshown, they leave no trace, tooltips included.
    if (!marksShown)
      for (const el of article!.querySelectorAll('.review-mark')) el.removeAttribute('title');
    const count = (state: DocsReviewMark['state']): number =>
      live.filter((mark) => mark.state === state).length;
    const before = liveBefore();
    words.textContent = `${before} → ${wordsAfter(live, before)} words`;
    counts.textContent = `${count('cut')} cut · ${count('keep')} keep · ${count('rewrite')} rewrite · ${count('good')} good`;
    missing.textContent = notFound.map((id) => `not found: ${id}`).join(', ');
    toggle.textContent = hiding ? 'Show original (H)' : 'Show result (H)';
    toggle.setAttribute('aria-pressed', String(hiding));
    const last = review.applied?.at(-1);
    applyButton.disabled = !!review.apply;
    cancelApply.hidden = !review.apply;
    applyState.hidden = !review.apply && !last;
    applyState.disabled = !!review.apply;
    applyState.textContent = review.apply
      ? `applying ${review.apply.scope === 'page' ? 'the page' : `“${review.apply.scope}”`}…`
      : `applied · ${last?.commit.slice(0, 7)}`;
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
    setHelp(false);
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
      const section = openSectionOf();
      if (!section) return;
      const mark = pushOwnerMark(sectionText(article!, section), state);
      render();
      save();
      panel?.reveal(`mark:${mark.id}`, true);
    },
    applyText() {
      const section = openSectionOf();
      return describeApply(
        section ? marksOf(section) : [],
        section ? wordsIn(sectionText(article!, section)) : 0,
      );
    },
    apply() {
      const section = openSectionOf();
      if (section) requestApply(section.title);
    },
    applying: () => !!review.apply,
  };

  // The owner's confirm writes `apply` into the file; the agent that watches it edits the page, removes `apply` and adds an `applied` entry.
  let poll: number | undefined;
  function watchApply(): void {
    window.clearInterval(poll);
    if (!review.apply) return;
    poll = window.setInterval(async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const fresh = (await res.json()) as DocsReview;
        if (fresh.apply) return;
        window.clearInterval(poll);
        // The agent's file is the newer one: take it whole, marks included.
        review.apply = undefined;
        if ((fresh.applied?.length ?? 0) > (review.applied?.length ?? 0))
          Object.assign(review, fresh);
        render();
      } catch {
        /* server restarting: the next tick asks again */
      }
    }, APPLY_POLL_MS);
  }
  function requestApply(scope: string): void {
    review.apply = { scope, requested: new Date().toISOString() };
    save();
    watchApply();
    render();
  }
  const closeConfirm = (): void => {
    confirm.hidden = true;
    applyButton.focus();
  };
  applyButton.addEventListener('click', () => {
    const { text, nothing } = describeApply(liveMarks(), liveBefore());
    confirmText.textContent = text;
    yes.hidden = nothing;
    confirm.hidden = false;
    (nothing ? no : yes).focus();
  });
  yes.addEventListener('click', () => {
    closeConfirm();
    requestApply('page');
  });
  no.addEventListener('click', closeConfirm);
  cancelApply.addEventListener('click', () => {
    review.apply = undefined;
    window.clearInterval(poll);
    save();
    render();
  });
  applyState.addEventListener('click', () => {
    if (panel?.heading === applyState) return closePanel();
    setHelp(false);
    closePanel();
    panel = openSectionPanel(historySection(), actions, true);
    refreshPanel();
  });
  watchApply();

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
    if (on) introduceKeys();
  });
  pageNotes.subscribe(() => active && render());
  void pageNotes.refresh().catch(() => {
    /* server restarting: the notes come with the next focus */
  });
  devOverlay.onEscape((e) => {
    // A field's own Escape drops its edit; the panel stays for the next one.
    if ((e.target as Element | null)?.closest('.review-panel textarea')) return true;
    if (!confirm.hidden) {
      closeConfirm();
      return true;
    }
    if (!help.hidden) {
      setHelp(false);
      return true;
    }
    if (!panel) return false;
    if (panel.escape()) return true;
    const opener =
      panel.heading.querySelector<HTMLElement>('.review-section-icon') ?? panel.heading;
    closePanel();
    (opener as HTMLElement).focus();
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
      const target = e.target as Element;
      if (!target.closest('.review-panel, .review-section-icon')) closePanel();
      if (!target.closest('.review-help, .review-keys-button')) setHelp(false);
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
  keysButton.addEventListener('click', () => setHelp(!!help.hidden, true));
  document.addEventListener('keydown', (e) => {
    const typing = !!(e.target as HTMLElement | null)?.closest(
      'input, textarea, select, [contenteditable]',
    );
    if (!active || typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === '?') setHelp(!!help.hidden, true);
    else if (key === 'h') setHiding(!hiding);
    else if (key === 'm') {
      marksShown = !marksShown;
      render();
    } else if (key === 'c') addMark('cut');
    else if (key === 'w') addMark('rewrite');
    else if (key === 'g') addMark('good');
  });

  render();
  if (active) introduceKeys();
}

void initReview();
