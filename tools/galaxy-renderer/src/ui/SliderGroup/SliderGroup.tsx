/**
 * SliderGroup — a small-caps divider header splitting a section body's flat
 * slider list into named clusters (`SfMapSection`'s FLUID panel is the
 * original: Simulation / Disc & rotation / Gas supply / …). Plain
 * composition, no fold — every slider stays mounted and DOM-order-visible to
 * `probeGpuErrors.ts`'s slider sweep, which counts by role, not by group.
 */
import type { ReactNode } from 'react';
import styles from './SliderGroup.module.css';

export type SliderGroupProps = {
  readonly title: string;
  readonly children: ReactNode;
};

function SliderGroup({ title, children }: SliderGroupProps): ReactNode {
  return (
    <div className={styles.root}>
      <div className={styles.header}>{title}</div>
      {children}
    </div>
  );
}

export default SliderGroup;
