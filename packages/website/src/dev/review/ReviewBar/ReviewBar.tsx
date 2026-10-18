/*
 * ReviewBar — the review's bar: the Notes/Marks switch, the page's job line, its word count and mark counts, the Keys box
 * (its child), the Apply page confirm, the apply state and the show-result switch. It keeps
 * --review-bar equal to its height, so the page is pushed down by what it measures and not a guess.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { DocsReviewApplied } from '../../../../../../tools/site/@types/DocsReviewApplied';
import type { DocsReviewApply } from '../../../../../../tools/site/@types/DocsReviewApply';
import type { ReviewCounts } from '../@types/ReviewCounts';
import ApplyConfirm from '../ApplyConfirm/ApplyConfirm.tsx';
import ModeSwitch from '../ModeSwitch/ModeSwitch.tsx';
import styles from './ReviewBar.module.css';

type ReviewBarProps = {
  job: string;
  onJob: (job: string) => void;
  words: { before: number; after: number };
  counts: Omit<ReviewCounts, 'notes'>;
  /** Marks whose text the page no longer has. */
  missing: string[];
  saveFlag: { text: string; error: boolean };
  hiding: boolean;
  onHiding: () => void;
  helpOpen: boolean;
  onHelp: () => void;
  apply: DocsReviewApply | undefined;
  lastApplied: DocsReviewApplied | undefined;
  historyOpen: boolean;
  onHistory: () => void;
  /** The consequence of applying the whole page, for the confirm line. */
  consequence: { text: string; nothing: boolean };
  onApply: () => void;
  onCancelApply: () => void;
  /** The Keys box, which hangs from the bar. */
  children?: ReactNode;
};

function ReviewBar({
  job,
  onJob,
  words,
  counts,
  missing,
  saveFlag,
  hiding,
  onHiding,
  helpOpen,
  onHelp,
  apply,
  lastApplied,
  historyOpen,
  onHistory,
  consequence,
  onApply,
  onCancelApply,
  children,
}: ReviewBarProps) {
  const bar = useRef<HTMLDivElement>(null);
  const applyButton = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(job);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => setDraft(job), [job]);

  useEffect(() => {
    const html = document.documentElement;
    const measure = () =>
      html.style.setProperty(
        '--review-bar',
        `${Math.ceil(bar.current!.getBoundingClientRect().height)}px`,
      );
    const watch = new ResizeObserver(measure);
    watch.observe(bar.current!);
    return () => {
      watch.disconnect();
      html.style.removeProperty('--review-bar');
    };
  }, []);

  const applyingScope = apply?.scope === 'page' ? 'the page' : `“${apply?.scope}”`;

  return (
    <div ref={bar} className={styles.root} data-overlay-ui="" data-review-bar="">
      <strong className={styles.name}>Review</strong>
      <ModeSwitch />
      <input
        className={styles.job}
        value={draft}
        placeholder="The question a reader comes to this page with"
        aria-label="The question a reader comes to this page with"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== job && onJob(draft)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span className={styles.words}>
        {words.before} → {words.after} words
      </span>
      <span className={styles.dim}>
        {counts.cut} cut · {counts.keep} keep · {counts.rewrite} rewrite · {counts.good} good
      </span>
      <button
        id="review-keys"
        className={styles.button}
        type="button"
        aria-controls="review-help"
        aria-expanded={helpOpen}
        data-review-keys=""
        onClick={onHelp}
      >
        Keys (?)
      </button>
      {children}
      {confirming && (
        <ApplyConfirm
          className={styles.confirm}
          consequence={consequence}
          returnTo={applyButton}
          onApply={onApply}
          onClose={() => setConfirming(false)}
        />
      )}
      {missing.length > 0 && (
        <span className={styles.missing}>{missing.map((id) => `not found: ${id}`).join(', ')}</span>
      )}
      <button
        ref={applyButton}
        className={styles.button}
        type="button"
        disabled={!!apply}
        onClick={() => setConfirming(true)}
      >
        Apply page
      </button>
      {(apply || lastApplied) && (
        <button
          className={styles.button}
          type="button"
          disabled={!!apply}
          aria-expanded={historyOpen}
          data-review-history=""
          onClick={onHistory}
        >
          {apply ? `applying ${applyingScope}…` : `applied · ${lastApplied?.commit.slice(0, 7)}`}
        </button>
      )}
      {apply && (
        <button className={styles.button} type="button" onClick={onCancelApply}>
          Cancel apply
        </button>
      )}
      <button
        className={styles.button}
        type="button"
        title="Show the result: cut passages gone, rewrites in place (H)"
        aria-pressed={hiding}
        onClick={onHiding}
      >
        {hiding ? 'Show original (H)' : 'Show result (H)'}
      </button>
      {saveFlag.text && (
        <span className={saveFlag.error ? styles.error : styles.dim}>{saveFlag.text}</span>
      )}
    </div>
  );
}

export default ReviewBar;
