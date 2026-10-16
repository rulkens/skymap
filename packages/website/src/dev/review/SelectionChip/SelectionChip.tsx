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
import { viewRect } from '../../feedback/viewRect';
import type { ChipAnchor } from '../@types/ChipAnchor';
import type { ChipMade } from '../@types/ChipMade';
import { placeChip } from '../placeChip';
import { readFreeBand } from '../readFreeBand';
import { readSelection } from '../readSelection';
import styles from './SelectionChip.module.css';

const SHOW_MS = 2000;
const FADE_MS = 300;

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
            <kbd>Esc</kbd> closes
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
            <kbd>C</kbd> cut
          </span>
          <span className={styles.dim}>
            <kbd>W</kbd> rewrite
          </span>
          <span className={styles.dim}>
            <kbd>G</kbd> good
          </span>
        </>
      )}
    </div>
  );
}

export default SelectionChip;
