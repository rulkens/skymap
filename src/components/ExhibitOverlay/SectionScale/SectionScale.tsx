/**
 * SectionScale — the exhibit notes' sections as a scale of miles, one unit each: a wash laid
 * up to the section being read, the kit's lozenge on it, and a numbered button per unit that
 * jumps to its section. Shown only where a look sets `--exhibit-scale-display`.
 */

import type { CSSProperties, ReactNode } from 'react';

import styles from './SectionScale.module.css';

export type SectionScaleProps = {
  readonly count: number;
  readonly active: number;
  readonly onJump: (index: number) => void;
};

function SectionScale({ count, active, onJump }: SectionScaleProps): ReactNode {
  const units = Array.from({ length: count }, (_, i) => i);
  const at = { '--at': (active + 0.5) / count, '--n': count } as CSSProperties;
  return (
    <nav className={styles.root} aria-label="Exhibit sections" style={at}>
      <div className={styles.track} aria-hidden="true">
        {units.map((i) => (
          <span key={i} className={styles.unit} />
        ))}
        <div className={styles.fill} />
        <div className={styles.pointer} />
      </div>
      <ol className={styles.ticks}>
        {units.map((i) => (
          <li key={i} className={styles.tickItem}>
            <button
              type="button"
              className={styles.tick}
              aria-current={i === active ? 'step' : undefined}
              aria-label={`Section ${i + 1} of ${count}`}
              onClick={() => onJump(i)}
            />
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default SectionScale;
