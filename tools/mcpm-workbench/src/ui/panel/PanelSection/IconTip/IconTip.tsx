/**
 * IconTip — a section icon with a tip on its hover. Hidden from assistive tech: the tip
 * text carries `id` so the fold button can point `aria-describedby` at it instead.
 * The tip's content mounts only while it shows (hover, or `focused`) and through its
 * fade-out: a live tip, like the Simulation one, would otherwise re-render while hidden.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import CompactInfoTip from '../../../../../../../src/components/common/CompactInfoTip/CompactInfoTip';
import styles from './IconTip.module.css';

export type IconTipProps = {
  readonly id: string;
  readonly tip: ReactNode;
  /** The fold button has keyboard focus, which shows the tip too. */
  readonly focused: boolean;
  readonly children: ReactNode;
};

function IconTip({ id, tip, focused, children }: IconTipProps): ReactNode {
  const tipTextRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const shown = hovered || focused;
  if (shown && !mounted) setMounted(true);

  // No fade to wait for when the tip is already transparent (reduced motion, touch).
  useEffect(() => {
    const tipBox = tipTextRef.current?.parentElement;
    if (!shown && tipBox && Number(getComputedStyle(tipBox).opacity) === 0) setMounted(false);
  }, [shown]);

  return (
    <span
      className={styles.root}
      aria-hidden
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onTransitionEnd={(e) => {
        if (e.propertyName === 'opacity' && !shown) setMounted(false);
      }}
    >
      <CompactInfoTip
        label={
          <span ref={tipTextRef} id={id} className={styles.tipText}>
            {mounted && tip}
          </span>
        }
        placement="bottom"
        align="start"
      >
        {children}
      </CompactInfoTip>
    </span>
  );
}

export default IconTip;
