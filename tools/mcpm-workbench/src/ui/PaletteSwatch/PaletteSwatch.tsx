/** PaletteSwatch — a palette's ramp, low to high left to right, as a small bar beside its name. */
import { useId, type ReactNode } from 'react';
import type { GradientStop } from '../../../@types/GradientStop';
import styles from './PaletteSwatch.module.css';

export type PaletteSwatchProps = {
  readonly stops: readonly GradientStop[];
  /** Height in CSS px, the icon size of its row; the bar is twice as wide. */
  readonly size: number;
};

function PaletteSwatch({ stops, size }: PaletteSwatchProps): ReactNode {
  const id = useId();
  return (
    <svg
      className={styles.root}
      viewBox="0 0 2 1"
      width={size * 2}
      height={size}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <linearGradient id={id}>
        {stops.map((stop) => (
          <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
        ))}
      </linearGradient>
      <rect width="2" height="1" fill={`url(#${id})`} />
    </svg>
  );
}

export default PaletteSwatch;
