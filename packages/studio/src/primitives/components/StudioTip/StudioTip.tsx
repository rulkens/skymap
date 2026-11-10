import type { ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import cx from 'classnames';
import { tipWarmth } from '../../data/tipWarmth';
import { CLOSE_GRACE_MS, EDGE_PX, GAP_PX, OPEN_DELAY_MS, WARM_MS } from './StudioTip.constants';
import s from './StudioTip.module.css';

// A manual popover (top layer): the dock's backdrop-filter would re-base a positioned
// child (the CompactInfoTip landmine), so placement is computed against the viewport here.
type Props = {
  readonly name: string;
  readonly meaning?: ReactNode;
  readonly keys?: readonly string[];
  readonly state?: ReactNode;
  /** Preferred side; flips when the viewport has no room. */
  readonly side?: 'top' | 'bottom';
  readonly className?: string;
  readonly children: ReactNode;
};

function StudioTip({ name, meaning, keys, state, side = 'top', className, children }: Props) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const timer = useRef(0);
  const [open, setOpen] = useState(false);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [caret, setCaret] = useState(0);
  const [below, setBelow] = useState(side === 'bottom');

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = useCallback(() => {
    window.clearTimeout(timer.current);
    if (performance.now() < tipWarmth.until) setOpen(true);
    else timer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  }, []);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setOpen((was) => {
        if (was) tipWarmth.until = performance.now() + WARM_MS;
        return false;
      });
    }, CLOSE_GRACE_MS);
  }, []);

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const el = tip.current;
    if (!a || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const roomAbove = a.top - GAP_PX - h >= EDGE_PX;
    const roomBelow = a.bottom + GAP_PX + h <= window.innerHeight - EDGE_PX;
    const goBelow = side === 'bottom' ? roomBelow || !roomAbove : !roomAbove && roomBelow;
    const centre = a.left + a.width / 2;
    const left = Math.min(Math.max(centre - w / 2, EDGE_PX), window.innerWidth - EDGE_PX - w);
    setBelow(goBelow);
    setX(left);
    setY(goBelow ? a.bottom + GAP_PX : a.top - GAP_PX - h);
    setCaret(centre - left);
  }, [side]);

  useLayoutEffect(() => {
    const el = tip.current;
    if (!el) return;
    if (open) {
      if (!el.matches(':popover-open')) el.showPopover();
      place();
    } else if (el.matches(':popover-open')) el.hidePopover();
  }, [open, place, name, meaning, state]);

  useEffect(() => {
    if (!open) return;
    // Capture phase: the dock stops every key at its root. Escape closes the innermost open
    // thing (ui-ux rule 8), so an open tip takes it and nothing else acts on it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  return (
    <span
      ref={anchor}
      className={cx(s.anchor, className)}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={(e) => e.target.matches(':focus-visible') && setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <span
        ref={tip}
        popover="manual"
        role="tooltip"
        className={cx(s.tip, below ? s.below : s.above)}
        style={{ left: x, top: y, ['--caret-x' as string]: `${caret}px` }}
        onPointerEnter={() => window.clearTimeout(timer.current)}
        onPointerLeave={hide}
      >
        <span className={s.head}>
          <b className={s.name}>{name}</b>
          {keys && keys.length > 0 && (
            <span className={s.keys}>
              {keys.map((k) => (
                <kbd key={k} className={s.key}>
                  {k}
                </kbd>
              ))}
            </span>
          )}
        </span>
        {meaning && <span className={s.meaning}>{meaning}</span>}
        {state && <span className={s.state}>{state}</span>}
      </span>
    </span>
  );
}

export default StudioTip;
