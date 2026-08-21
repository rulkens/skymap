/**
 * Toggle — a labelled on/off button. Tool-local (see Slider's header note);
 * a plain `<button>` rather than the shared `common/Button` so this file
 * has no dependency beyond React + the global CSS tokens.
 */
import type { ReactNode } from 'react';

export type ToggleProps = {
  readonly label: string;
  readonly on: boolean;
  readonly onToggle: () => void;
  /**
   * Overrides the accessible name (default: the visible "{label}: on/off"
   * text). A row of value pills (e.g. render layers) wants a name that says
   * what the row IS, not just the bare number, so a screen reader or probe
   * selector doesn't have to infer it from neighbouring buttons.
   */
  readonly ariaLabel?: string;
};

function Toggle({ label, on, onToggle, ariaLabel }: ToggleProps): ReactNode {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={ariaLabel}
      onClick={onToggle}
      style={{
        fontFamily: 'var(--font-family-mono)',
        fontSize: 'var(--font-size-sm)',
        letterSpacing: 'var(--letter-spacing-tight)',
        padding: 'var(--space-3) var(--space-5)',
        borderRadius: '4px',
        border: '1px solid var(--border-control)',
        background: on ? 'var(--surface-control-active)' : 'var(--surface-control)',
        color: on ? 'var(--color-accent-bright)' : 'var(--color-fg-muted)',
        cursor: 'pointer',
      }}
    >
      {label}: {on ? 'on' : 'off'}
    </button>
  );
}

export default Toggle;
