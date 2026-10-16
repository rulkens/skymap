/*
 * ReviewPage — the review of one page while the overlay is on. Select text and press c, w or g to
 * add a mark; m shows the marks in the text (click one to cycle its state); h flips between the
 * original and the result. Each reviewed heading carries an icon that opens its section's panel. The
 * keys are listed in a box the bar's Keys button (or ?) opens. What the marks do to the page's own text
 * is in usePaintedPage; its look is ReviewPage.module.css.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import type { DocsReview } from '../../../../../../tools/site/@types/DocsReview';
import type { DocsReviewMark } from '../../../../../../tools/site/@types/DocsReviewMark';
import { pageNotes } from '../../overlay/pageNotes';
import { recall } from '../../overlay/recall';
import { remember } from '../../overlay/remember';
import { useDevOverlayEscape } from '../../overlay/useDevOverlayEscape';
import { useDevOverlayOn } from '../../overlay/useDevOverlayOn';
import { useDevOverlayPress } from '../../overlay/useDevOverlayPress';
import { useListener } from '../../overlay/useListener';
import type { ReviewOpen } from '../@types/ReviewOpen';
import type { ReviewReveal } from '../@types/ReviewReveal';
import type { ReviewSection } from '../@types/ReviewSection';
import { claimKeysIntro } from '../claimKeysIntro';
import { describeApply } from '../describeApply';
import { flashMark } from '../flashMark';
import { itemKey } from '../itemKey';
import { ownerMark } from '../ownerMark';
import { sectionText } from '../sectionText';
import { setNote } from '../setNote';
import { useApplyPoll } from '../useApplyPoll';
import { usePageChrome } from '../usePageChrome';
import { usePaintedPage } from '../usePaintedPage';
import { useReviewFile } from '../useReviewFile';
import { wordsAfter } from '../wordsAfter';
import { wordsIn } from '../wordsIn';
import KeysHelp from '../KeysHelp/KeysHelp.tsx';
import ReviewBar from '../ReviewBar/ReviewBar.tsx';
import SectionIcons from '../SectionIcons/SectionIcons.tsx';
import SectionPanel from '../SectionPanel/SectionPanel.tsx';
import reviewPage from './ReviewPage.module.css';

const HIDE_KEY = 'skymap-review-hide-cut';
const NEXT_STATE = { cut: 'keep', keep: 'rewrite', rewrite: 'good', good: 'cut' } as const;

const marksOf = (section: ReviewSection): DocsReviewMark[] =>
  section.items.flatMap((item) => (item.kind === 'mark' ? [item.mark] : []));

type ReviewPageProps = { article: Element; url: string; first: DocsReview };

function ReviewPage({ article, url, first }: ReviewPageProps) {
  const active = useDevOverlayOn();
  const { review, change, adopt, saveFlag } = useReviewFile(url, first);
  const [hiding, setHiding] = useState(() => recall(HIDE_KEY) === '1');
  const [marksShown, setMarksShown] = useState(false);
  const [help, setHelp] = useState<{ focus: boolean } | null>(null);
  const [open, setOpen] = useState<ReviewOpen | null>(null);
  const [reveal, setReveal] = useState<ReviewReveal>();
  // A mark just made or cycled: its panel opens once the page has been painted and its section is known.
  const [pending, setPending] = useState<ReviewReveal>();
  const serial = useRef(0);
  const swallowClick = useRef(false);

  // What earlier applies carried out is history: out of the text, the counts and the section panels.
  const applied = useMemo(
    () => new Set((review.applied ?? []).flatMap((entry) => entry.markIds)),
    [review.applied],
  );
  const live = useMemo(
    () => review.marks.filter((m) => !applied.has(m.id)),
    [review.marks, applied],
  );
  const history = useMemo(
    () =>
      review.marks
        .filter((m) => applied.has(m.id))
        .map((mark) => ({ kind: 'mark' as const, mark })),
    [review.marks, applied],
  );
  // The page's words now: the cutter's count less what applies took out, which is the last apply's "after".
  const before = wordsAfter(
    history.map((item) => item.mark),
    review.words.before,
  );

  const { sections, missing } = usePaintedPage(article, active, live, marksShown);
  usePageChrome(article, active, hiding, marksShown);
  useApplyPoll(url, !!review.apply, adopt);

  const section =
    open && open.target !== 'applied' ? sections.find((s) => s.heading === open.target) : undefined;
  const sectionWords = useMemo(() => {
    if (!section) return undefined;
    const words = wordsIn(sectionText(article, section));
    return { before: words, after: wordsAfter(marksOf(section), words) };
  }, [article, section]);

  const closePanel = () => {
    setOpen(null);
    setReveal(undefined);
  };
  const closeHelp = () => {
    if (document.getElementById('review-help')?.contains(document.activeElement))
      document.getElementById('review-keys')?.focus();
    setHelp(null);
  };
  // The Keys box and a section panel share the corner, so only one is open at a time.
  const openHelp = (focus: boolean) => {
    closePanel();
    setHelp({ focus });
  };
  const openPanel = (target: ReviewOpen['target'], key?: string, focus = false) => {
    closeHelp();
    setOpen({ target, serial: ++serial.current });
    setReveal(key ? { key, focus } : undefined);
  };
  const toggleHelp = () => (help ? closeHelp() : openHelp(true));

  useEffect(() => {
    if (!active) {
      setOpen(null);
      setHelp(null);
    } else if (claimKeysIntro()) setHelp({ focus: false });
  }, [active]);

  // The section can go away under an open panel (its last mark deleted).
  useEffect(() => {
    if (open && open.target !== 'applied' && !section) setOpen(null);
  }, [open, section]);

  useEffect(() => {
    if (!pending) return;
    // An item in an h3 is listed by the h3 as well as the h2 around it: the panel opens on the nearest.
    const nearest = [...sections]
      .reverse()
      .find((s) => s.items.some((i) => itemKey(i) === pending.key));
    if (!nearest) return;
    setPending(undefined);
    openPanel(nearest.heading, pending.key, pending.focus);
  }, [pending, sections]);

  const setState = (mark: DocsReviewMark, state: DocsReviewMark['state']) =>
    change((r) => ({ ...r, marks: r.marks.map((m) => (m.id === mark.id ? { ...m, state } : m)) }));
  const setMarkNote = (mark: DocsReviewMark, key: 'why' | 'how' | 'after', value: string) =>
    change((r) => ({
      ...r,
      marks: r.marks.map((m) => (m.id === mark.id ? setNote(m, key, value) : m)),
    }));
  const addMark = (text: string, state: DocsReviewMark['state']): DocsReviewMark => {
    const mark = ownerMark(review.marks, text, state);
    change((r) => ({ ...r, marks: [...r.marks, mark] }));
    return mark;
  };
  const requestApply = (scope: string) =>
    change((r) => ({ ...r, apply: { scope, requested: new Date().toISOString() } }));

  const markSelection = (state: DocsReviewMark['state']) => {
    const selection = getSelection();
    const range = selection && !selection.isCollapsed ? selection.getRangeAt(0) : null;
    if (!range || !article.contains(range.commonAncestorContainer)) return;
    const text = selection!.toString().replace(/\s+/g, ' ').trim();
    if (!text) return;
    const mark = addMark(text, state);
    selection!.removeAllRanges();
    setPending({ key: `mark:${mark.id}`, focus: true });
  };

  const markWholeSection = (state: 'cut' | 'good') => {
    if (!section) return;
    const mark = addMark(sectionText(article, section), state);
    setReveal({ key: `mark:${mark.id}`, focus: true });
  };

  const goTo = (target: DocsReviewMark | Element) =>
    flashMark(
      target instanceof Element
        ? [target]
        : [
            ...article.querySelectorAll(
              `.${reviewPage.mark}[data-review-id="${CSS.escape(target.id)}"]`,
            ),
          ],
    );

  const toggleHiding = () => {
    remember(HIDE_KEY, hiding ? '0' : '1');
    setHiding(!hiding);
  };

  useDevOverlayEscape(() => {
    if (help) {
      closeHelp();
      return true;
    }
    if (!open) return false;
    const opener =
      open.target === 'applied'
        ? document.querySelector<HTMLElement>('[data-review-history]')
        : (open.target.querySelector<HTMLElement>('[data-review-icon]') ?? open.target);
    closePanel();
    (opener as HTMLElement | null)?.focus();
    return true;
  });

  // The capture layer sits over the article: an icon under a press opens its panel from here.
  useDevOverlayPress((x, y) => {
    const icon = document.elementsFromPoint(x, y).find((el) => el.hasAttribute('data-review-icon'));
    if (!icon) return false;
    (icon as HTMLElement).click();
    // The click that ends this press lands on the capture layer and must not close what it opened.
    swallowClick.current = true;
    return true;
  });

  // A click anywhere but the panel and its icons closes it; capture, so a click that opens one is not undone.
  useListener(
    document,
    'click',
    (e) => {
      if (swallowClick.current) {
        swallowClick.current = false;
        return;
      }
      const target = e.target as Element;
      if (!target.closest('[data-review-panel], [data-review-icon]')) closePanel();
      if (!target.closest('[data-review-keys]')) closeHelp();
    },
    true,
  );

  // Marks are clicked with Shift held, which lets the pointer through the capture layer.
  useListener(article, 'click', (e) => {
    const target = e.target as Element;
    if (!marksShown || !getSelection()?.isCollapsed || target.closest('[data-review-icon]')) return;
    const id = target.closest<HTMLElement>(`.${reviewPage.mark}`)?.dataset.reviewId;
    const mark = review.marks.find((m) => m.id === id);
    if (!mark) return;
    e.preventDefault();
    setState(mark, NEXT_STATE[mark.state]);
    setPending({ key: `mark:${mark.id}`, focus: false });
  });

  useListener(document, 'keydown', (e) => {
    const typing = !!(e.target as HTMLElement | null)?.closest(
      'input, textarea, select, [contenteditable]',
    );
    if (!active || typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === '?') toggleHelp();
    else if (key === 'h') toggleHiding();
    else if (key === 'm') setMarksShown(!marksShown);
    else if (key === 'c') markSelection('cut');
    else if (key === 'w') markSelection('rewrite');
    else if (key === 'g') markSelection('good');
  });

  if (!active) return null;

  const count = (state: DocsReviewMark['state']) => live.filter((m) => m.state === state).length;
  const panelProps = {
    applying: !!review.apply,
    reveal,
    onState: setState,
    onNote: setMarkNote,
    onGo: goTo,
    onDeleteNote: (id: string) => void pageNotes.remove(id).catch((e: unknown) => console.error(e)),
    onWhole: markWholeSection,
  };

  return (
    <>
      <SectionIcons
        sections={sections}
        open={open && open.target !== 'applied' ? open.target : null}
        onToggle={(s) => (open?.target === s.heading ? closePanel() : openPanel(s.heading))}
      />
      <ReviewBar
        job={review.job}
        onJob={(job) => change((r) => ({ ...r, job }))}
        words={{ before, after: wordsAfter(live, before) }}
        counts={{
          cut: count('cut'),
          keep: count('keep'),
          rewrite: count('rewrite'),
          good: count('good'),
        }}
        missing={missing}
        saveFlag={saveFlag}
        hiding={hiding}
        onHiding={toggleHiding}
        helpOpen={!!help}
        onHelp={toggleHelp}
        apply={review.apply}
        lastApplied={review.applied?.at(-1)}
        historyOpen={open?.target === 'applied'}
        onHistory={() => (open?.target === 'applied' ? closePanel() : openPanel('applied'))}
        consequence={describeApply(live, before)}
        onApply={() => requestApply('page')}
        onCancelApply={() => change((r) => ({ ...r, apply: undefined }))}
      >
        {help && <KeysHelp focus={help.focus} />}
      </ReviewBar>
      {open && section && sectionWords && (
        <SectionPanel
          key={open.serial}
          {...panelProps}
          title={section.title}
          items={section.items}
          words={sectionWords}
          consequence={describeApply(marksOf(section), sectionWords.before)}
          onApply={() => requestApply(section.title)}
        />
      )}
      {open?.target === 'applied' && (
        <SectionPanel
          key={open.serial}
          {...panelProps}
          title="Applied"
          items={history}
          history
          consequence={{ text: '', nothing: true }}
          onApply={() => {}}
        />
      )}
    </>
  );
}

export default ReviewPage;
