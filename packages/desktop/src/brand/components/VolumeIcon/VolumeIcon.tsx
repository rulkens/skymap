/**
 * VolumeIcon — the mounted dmg's icon: an external drive in the icon's navy, seen a little from above,
 * with the Void mark on its top face. Drawn on Apple's 1024 grid; the drop shadow is its own shape
 * under the body, never a filter on it (that bands the navy, see website utils/skymapIcon).
 */

import type { ReactNode } from 'react';
import type { MarkDrawing } from '../../../../../website/src/@types/MarkDrawing';
import { MARK_COLOURS } from '../../../../../website/src/data/markColours';
import { voidMark } from '../../../../../website/src/utils/voidMark';
import styles from './VolumeIcon.module.css';

export type VolumeIconProps = {
  readonly drawing: MarkDrawing;
};

function VolumeIcon({ drawing }: VolumeIconProps): ReactNode {
  const edge = drawing === 'small' ? 14 : 3;
  return (
    <svg className={styles.root} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <radialGradient id="volume-top" cx="0.5" cy="0" r="1.1">
          <stop offset="0" stopColor={MARK_COLOURS.panel} />
          <stop offset="1" className={styles.ground} />
        </radialGradient>
        <linearGradient id="volume-front" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" className={styles.lip} />
          <stop offset="1" className={styles.ground} />
        </linearGradient>
        <filter
          id="volume-shadow"
          x="-10%"
          y="-10%"
          width="120%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow dx="0" dy="14" stdDeviation="14" floodOpacity="0.4" />
        </filter>
        <clipPath id="volume-face">
          <rect x="112" y="268" width="800" height="412" rx="72" />
        </clipPath>
      </defs>
      <rect x="112" y="268" width="800" height="492" rx="72" filter="url(#volume-shadow)" />
      <rect x="112" y="268" width="800" height="492" rx="72" fill="url(#volume-front)" />
      <rect x="112" y="268" width="800" height="412" rx="72" fill="url(#volume-top)" />
      <g clipPath="url(#volume-face)">
        <g
          transform="translate(293.6 264) scale(4.2)"
          dangerouslySetInnerHTML={{ __html: voidMark(drawing) }}
        />
      </g>
      <g className={styles.edge} strokeWidth={edge}>
        <rect x="112" y="268" width="800" height="412" rx="72" />
        <rect x="112" y="268" width="800" height="492" rx="72" />
      </g>
      <circle className={styles.light} cx="836" cy="722" r={drawing === 'small' ? 0 : 9} />
    </svg>
  );
}

export default VolumeIcon;
