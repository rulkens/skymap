/*
 * SelectionChip — a small tag by the text selected for a mark: its word count and the keys that mark it,
 * then, once a key has made a mark, what was saved. It takes no pointer and no focus, so the selection
 * stays; a failed save stays until Esc or a click, a saved one fades by itself.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { cx } from '../../../utils/cx.ts';
import { useDevOverlayEscape } from '../../overlay/useDevOverlayEscape';
import { useLatest } from '../../overlay/useLatest';
import { useListener } from '../../overlay/useListener';
import { useViewport } from '../../overlay/useViewport';
import { pageRect } from '../../feedback/pageRect';
import { viewRect } from '../../feedback/viewRect';
import type { ChipAnchor } from '../@types/ChipAnchor';
import type { ChipMade } from '../@types/ChipMade';
import { placeChip } from '../placeChip';
import { wordsIn } from '../wordsIn';
import styles from './SelectionChip.module.css';

const SHOW_MS = 2000;
const FADE_MS = 300;

/** The window's width and the vertical band the site's top bar, the review bar (top or foot) and a panel sheet at the foot leave free. */
function readFreeBand(): { width: number; top: number; bottom: number } {
  const html = document.documentElement;
  const nav = document.querySelector('header')?.getBoundingClientRect();
  const bar = document.querySelector('[data-review-bar]')?.getBoundingClientRect();
  const panel = document.querySelector('[data-review-panel]')?.getBoundingClientRect();
  let top = Math.max(0, nav?.bottom ?? 0);
  let bottom = html.clientHeight;
  if (bar) {
    if (bar.top > bottom / 2) bottom = bar.top;
    else top = Math.max(top, bar.bottom);
  }
  // A panel as wide as the window is the sheet a phone gets, up from the foot.
  if (panel && panel.width > html.clientWidth / 2) bottom = Math.min(bottom, panel.top);
  return { width: html.clientWidth, top, bottom };
}

/** The selection inside `article`: its word count and where its first and last lines are; null when there is none. */
function readSelection(article: Element): { words: number; anchor: ChipAnchor } | null {
  const selection = getSelection();
  if (!selection || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!article.contains(range.commonAncestorContainer)) return null;
  const lines = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
  const words = wordsIn(selection.toString());
  if (!words || lines.length === 0) return null;
  return { words, anchor: { first: pageRect(lines[0]!), last: pageRect(lines.at(-1)!) } };
}

const words = (n: number) => `${n} ${n === 1 ? 'word' : 'words'}`;

type SelectionChipProps = {
  article: Element;
  made: ChipMade | null;
  save: { text: string; error: boolean };
  /** The confirmation is over: faded, or dismissed. */
  onDone: () => void;
};

function SelectionChip({ article, made, save, onDone }: SelectionChipProps) {
  const viewport = useViewport();
  const root = useRef<HTMLDivElement>(null);
  const done = useLatest(onDone);
  // The last selection read stays after the mark clears it, so the confirmation sits where it was made.
  const [picked, setPicked] = useState<ReturnType<typeof readSelection>>(null);
  const [live, setLive] = useState(false);
  const [fading, setFading] = useState(false);

  const read = () => {
    const found = readSelection(article);
    setLive(!!found);
    if (found) setPicked(found);
  };
  useListener(document, 'selectionchange', read);
  // The page moves under a still selection when it scrolls or resizes.
  useEffect(read, [viewport]);

  const outcome = !made ? null : save.error ? 'failed' : save.text === 'saved' ? 'saved' : 'saving';
  useEffect(() => {
    setFading(false);
    if (outcome !== 'saved') return;
    const fade = setTimeout(() => setFading(true), SHOW_MS);
    const end = setTimeout(() => done.current(), SHOW_MS + FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(end);
    };
  }, [outcome, made, done]);

  const shown = !!picked && (live || !!made);
  useDevOverlayEscape(() => {
    if (!shown) return false;
    getSelection()?.removeAllRanges();
    done.current();
    return true;
  });

  const anchor: ChipAnchor | null = picked && {
    first: viewRect(picked.anchor.first, viewport),
    last: viewRect(picked.anchor.last, viewport),
  };
  // After every render: the chip's size changes with its text, and its place with the scroll.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !anchor) return;
    // Measured from the left edge: next to the window's edge the box would be squeezed and wrap.
    el.style.left = '0px';
    const at = placeChip(
      anchor,
      { width: el.offsetWidth, height: el.offsetHeight },
      readFreeBand(),
    );
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
  });

  if (!shown) return null;

  const label =
    made && `${made.state[0]!.toUpperCase()}${made.state.slice(1)}, ${words(made.words)}`;
  return (
    <div
      ref={root}
      className={cx(styles.root, outcome === 'failed' && styles.failed, fading && styles.fading)}
      role={outcome === 'failed' ? 'alert' : outcome ? 'status' : undefined}
      data-overlay-ui=""
      // A press must not move focus or drop the selection; a failed save is dismissed by it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={outcome === 'failed' ? () => done.current() : undefined}
    >
      {outcome === 'failed' ? (
        <>
          <span>Not saved</span>
          <span>{label}</span>
          <span className={styles.dim}>
            <kbd className={styles.key}>Esc</kbd> closes
          </span>
        </>
      ) : made ? (
        <>
          <span>{label}</span>
          {outcome === 'saving' && <span className={styles.dim}>saving…</span>}
        </>
      ) : (
        <>
          <span>{words(picked!.words)}</span>
          <span className={styles.dim}>
            <kbd className={styles.key}>C</kbd> cut
          </span>
          <span className={styles.dim}>
            <kbd className={styles.key}>W</kbd> rewrite
          </span>
          <span className={styles.dim}>
            <kbd className={styles.key}>G</kbd> good
          </span>
        </>
      )}
    </div>
  );
}

export default SelectionChip;
