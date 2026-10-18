/*
 * FeedbackCapture — the layer over the page in Notes mode (Marks mode has none, so the page's text selects): a click chooses the element under
 * the pointer, a mouse or pen drag draws an area. It is never scrollable and sets no touch-action, so
 * wheel and touch scrolling pass through; a finger drag is the page scrolling, not a rectangle.
 */
import { useMemo, useRef, useState, type PointerEvent } from 'react';

import type { FeedbackRect } from '../../../../../../tools/site/@types/FeedbackRect';
import { devOverlay } from '../../overlay/devOverlay';
import { useViewport } from '../../overlay/useViewport';
import type { FeedbackPoint } from '../@types/FeedbackPoint';
import type { FeedbackPress } from '../@types/FeedbackPress';
import type { FeedbackSelection } from '../@types/FeedbackSelection';
import { describeHover } from '../describeHover';
import { pageRect } from '../pageRect';
import { pickElement } from '../pickElement';
import { spanRect } from '../spanRect';
import FeedbackOutline from '../FeedbackOutline/FeedbackOutline.tsx';
import styles from './FeedbackCapture.module.css';

// Pixels the pointer must travel before a press becomes a drawn rectangle, not a click.
const DRAG_PX = 6;

type FeedbackCaptureProps = {
  /** An area is already chosen: presses are handed back, and nothing is outlined. */
  locked: boolean;
  onChoose: (selection: FeedbackSelection) => void;
  onPressWhileLocked: () => void;
};

function FeedbackCapture({ locked, onChoose, onPressWhileLocked }: FeedbackCaptureProps) {
  const viewport = useViewport();
  const [pointer, setPointer] = useState<FeedbackPoint | null>(null);
  const [drawn, setDrawn] = useState<FeedbackRect | null>(null);
  const press = useRef<FeedbackPress | null>(null);

  // The page moves under a still pointer when it scrolls, so the outline follows the viewport too.
  const hover = useMemo(
    () => (locked || drawn || !pointer ? null : describeHover(pointer)),
    [locked, drawn, pointer, viewport],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (devOverlay.press(e.clientX, e.clientY)) return e.preventDefault();
    if (locked) return onPressWhileLocked();
    press.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, drawing: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const here = { x: e.clientX, y: e.clientY };
    setPointer(here);
    const held = press.current;
    if (held?.id !== e.pointerId) return;
    held.moved ||= Math.hypot(here.x - held.x, here.y - held.y) > DRAG_PX;
    if (held.moved && e.pointerType !== 'touch' && !held.drawing) {
      held.drawing = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (held.drawing) setDrawn(spanRect(held, here));
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const done = press.current;
    press.current = null;
    setDrawn(null);
    if (done?.id !== e.pointerId) return;
    if (done.drawing) {
      const area = spanRect(done, { x: e.clientX, y: e.clientY });
      const centre = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
      return onChoose({
        kind: 'rectangle',
        rect: pageRect(area),
        element: pickElement(centre.x, centre.y),
      });
    }
    if (done.moved) return;
    const element = pickElement(e.clientX, e.clientY);
    onChoose({ kind: 'element', rect: pageRect(element.getBoundingClientRect()), element });
  };

  return (
    <>
      <div
        className={styles.root}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          press.current = null;
          setDrawn(null);
        }}
        onPointerLeave={() => setPointer(null)}
      />
      {hover && <FeedbackOutline rect={hover.rect} label={hover.label} />}
      {drawn && <FeedbackOutline rect={drawn} chosen />}
    </>
  );
}

export default FeedbackCapture;
