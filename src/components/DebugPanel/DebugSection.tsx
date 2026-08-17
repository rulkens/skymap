// src/components/DebugPanel/DebugSection.tsx
/**
 * DebugSection — shared collapsible chrome for a DebugPanel section.
 *
 * Every section wants the same `<details>` + bold `<summary>` shell. This
 * component owns that chrome in one place, so a future tweak to it is a
 * single edit rather than a hunt through every section.
 *
 * ### Why open-state is mirrored into `useState`, not read straight off `open`
 *
 * `GpuTimingsSection` re-renders every frame (up to 60×/s). A bare
 * `<details open>` driven only by a prop would force the element open on
 * every one of those re-renders, and the user's own toggle-to-collapse click
 * would be undone before the next frame — the section could never be closed.
 * Mirroring `defaultOpen` into local state and writing back via `onToggle`
 * makes the DOM's open/closed state the source of truth after the first
 * render, so it survives whatever cadence the parent re-renders at.
 *
 * ### Why this imports `debugSection.module.css` directly, not its own module
 *
 * The natural name for this component's own CSS module is
 * `DebugSection.module.css` — but that differs from the existing shared
 * vocabulary module `debugSection.module.css` only by the leading letter's
 * case, and the checkout's filesystem is case-insensitive, so the two names
 * resolve to one file. Rather than rename either file, this component reuses
 * `debugSection.module.css`'s `.root` / `.summary` / `.body` classes directly.
 */

import { useState, type ReactNode } from 'react';
import styles from './debugSection.module.css';

export type DebugSectionProps = {
  /** Summary content — a plain string or a node carrying live values. */
  readonly title: ReactNode;
  /** Initial open state. Defaults to closed. */
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
};

function DebugSection({ title, defaultOpen, children }: DebugSectionProps): ReactNode {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <details className={styles.root} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={styles.summary}>{title}</summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}

export default DebugSection;
