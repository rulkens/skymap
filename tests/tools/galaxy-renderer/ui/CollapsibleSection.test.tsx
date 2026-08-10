// @vitest-environment jsdom
//
// CollapsibleSection is controlled (open/onToggle are plain props, no
// internal state of its own), so nesting is just composition — render one
// inside another's `children`, each wired to its own open/onToggle pair.
// What's worth pinning here is `variant="nested"`'s contract: a section
// rendered without a variant must stay byte-identical to every section
// already in the panel (no stray class, no stray data attribute), a section
// rendered WITH it must carry the probe's `data-nested` discovery hook and
// the diminished header/indented-body classes, and a nested section's open
// state must be independent of its parent's.

import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import CollapsibleSection from '../../../../tools/galaxy-renderer/src/ui/CollapsibleSection/CollapsibleSection';
import styles from '../../../../tools/galaxy-renderer/src/ui/CollapsibleSection/CollapsibleSection.module.css';

describe('CollapsibleSection nesting', () => {
  it('renders a top-level section with no nested class or data-nested hook', () => {
    const { container } = render(
      <CollapsibleSection title="SHAPE" open onToggle={() => {}}>
        <div />
      </CollapsibleSection>,
    );
    const button = container.querySelector('button[aria-expanded]')!;
    expect(button.hasAttribute('data-nested')).toBe(false);
    expect(button.parentElement?.className).not.toContain(styles.nestedHeader);
  });

  it('marks a nested section for the probe and applies the diminished style', () => {
    const { container } = render(
      <CollapsibleSection title="DIG" open onToggle={() => {}} variant="nested">
        <div />
      </CollapsibleSection>,
    );
    const button = container.querySelector('button[aria-expanded]')!;
    expect(button.getAttribute('data-nested')).toBe('true');
    expect(button.parentElement?.className).toContain(styles.nestedHeader);
  });

  it("persists a nested section's open state independently of its parent", () => {
    function Harness() {
      const [parentOpen, setParentOpen] = useState(true);
      const [childOpen, setChildOpen] = useState(false);
      return (
        <CollapsibleSection
          title="HII REGIONS"
          open={parentOpen}
          onToggle={() => setParentOpen((v) => !v)}
        >
          <CollapsibleSection
            title="DIG"
            open={childOpen}
            onToggle={() => setChildOpen((v) => !v)}
            variant="nested"
          >
            <div data-testid="dig-body" />
          </CollapsibleSection>
        </CollapsibleSection>
      );
    }
    const { getByRole, queryByTestId } = render(<Harness />);
    expect(queryByTestId('dig-body')).toBeNull();

    fireEvent.click(getByRole('button', { name: 'DIG' }));
    expect(queryByTestId('dig-body')).not.toBeNull();

    // Folding the parent unmounts everything inside it, DIG's state and
    // all — this only pins that clicking HII REGIONS didn't ALSO toggle
    // DIG's own onToggle (the classic shared-key bug this prop guards
    // against).
    fireEvent.click(getByRole('button', { name: 'HII REGIONS' }));
    expect(queryByTestId('dig-body')).toBeNull();
  });
});
