/**
 * Toggle — a labelled on/off button built on the shared Button primitive.
 *
 * Presentational: `on` drives the visual state (accent fill when on, ghost when
 * off) and `onToggle` fires on click. Used for layer enables and the labels
 * switch. Reusing `common/Button` keeps the affordance identical to the main
 * app's buttons (font, focus ring, padding) rather than reinventing chrome.
 */
import type { ReactNode } from 'react';
import Button from '../../../../../src/components/common/Button/Button';

export type ToggleProps = {
  readonly label: string;
  readonly on: boolean;
  readonly onToggle: () => void;
};

function Toggle({ label, on, onToggle }: ToggleProps): ReactNode {
  return (
    <Button variant={on ? 'primary' : 'ghost'} aria-pressed={on} onClick={onToggle}>
      {label}: {on ? 'on' : 'off'}
    </Button>
  );
}

export default Toggle;
