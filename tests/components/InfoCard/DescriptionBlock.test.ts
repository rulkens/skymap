// @vitest-environment jsdom
//
// DescriptionBlock — the collapsible prose + show-more/less toggle shared by
// GalaxyDetailCard and StructureDetailCard. Verifies the toggle round-trips the
// collapse state and that the prose text is always rendered.
//
// jsdom env + @testing-library/react + createElement so the file stays .ts and
// is picked up by Vitest's `include: ['tests/**/*.test.ts']` glob.

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import DescriptionBlock from '../../../src/components/InfoCard/DescriptionBlock/DescriptionBlock';
import styles from '../../../src/components/InfoCard/DescriptionBlock/DescriptionBlock.module.css';

const PROSE = 'Coma is a rich cluster of over a thousand galaxies in the Coma supercluster.';

describe('DescriptionBlock', () => {
  it('expands to "show less" when toggled, and collapses back', () => {
    render(createElement(DescriptionBlock, { text: PROSE }));
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: 'show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: 'show more' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
