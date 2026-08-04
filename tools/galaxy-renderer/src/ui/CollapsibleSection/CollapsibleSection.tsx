/**
 * CollapsibleSection — a foldable HUD group (SHAPE & SIZE, SPIRAL ARMS, …).
 *
 * Controlled, not self-managed: the caller owns `open` and flips it via
 * `onToggle`, so a "collapse all" affordance stays a one-line addition —
 * a component-local `useState` would wall that state off from the caller.
 *
 * The header is a ROW of independent controls rather than one big button: the
 * fold sits in its own `<button>` beside the optional master-toggle checkbox
 * (the app SettingsPanel's idiom) and the optional copy button. Nesting them
 * inside the fold would be invalid HTML and would need stopPropagation on
 * every pointer event to keep the affordances apart.
 */
import type { ReactNode } from 'react';
import CopyButton from '../../../../../src/components/common/CopyButton/CopyButton';
import styles from './CollapsibleSection.module.css';

export type CollapsibleSectionProps = {
  readonly title: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly headerToggle?: boolean;
  readonly onHeaderToggleChange?: (value: boolean) => void;
  /**
   * This section's live values keyed by their own path in the store —
   * `{ fieldTuning: { arms: { widthScale: 2.3, … } } }`. The path is the whole
   * point: pasted back, the block says which state it patches, so a value
   * tuned by eye reaches its default site without a label-to-field guess.
   * Omit it where a section drives no tuning state (DEBUG VIEWS) — an empty
   * object is worse than no button.
   *
   * Partial by design: two sections may split one state node (ARM OVERDENSITIES
   * and ARM CLOUD both sit under `fieldTuning.arms`), and each carries only its
   * own half. That makes a payload a transcription target, NOT something to
   * dispatch — `fieldTuningPatched` replaces a node wholesale, so feeding it
   * half a node drops the other half.
   */
  readonly copyPayload?: Record<string, unknown>;
  readonly children: ReactNode;
};

function CollapsibleSection({
  title,
  open,
  onToggle,
  headerToggle,
  onHeaderToggleChange,
  copyPayload,
  children,
}: CollapsibleSectionProps): ReactNode {
  const hasHeaderToggle = headerToggle !== undefined && onHeaderToggleChange !== undefined;
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        {hasHeaderToggle && (
          <input
            type="checkbox"
            className={styles.headerToggle}
            checked={headerToggle}
            onChange={(e) => onHeaderToggleChange(e.target.checked)}
            aria-label={`Toggle ${title}`}
          />
        )}
        <button type="button" className={styles.foldButton} onClick={onToggle} aria-expanded={open}>
          <span className={styles.headerTitle}>{title}</span>
          <span className={styles.chevron} aria-hidden>
            {open ? '▾' : '▸'}
          </span>
        </button>
        {copyPayload && (
          <CopyButton
            className={styles.copyButton}
            text={JSON.stringify(copyPayload, null, 2)}
            label="⧉"
            title={`Copy ${title} values as JSON`}
          />
        )}
      </div>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  );
}

export default CollapsibleSection;
