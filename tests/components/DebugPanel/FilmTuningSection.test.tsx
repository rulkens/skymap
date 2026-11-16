// @vitest-environment jsdom

/**
 * FilmTuningSection — the ratio select round-trips a number through option
 * strings; a slip there (a string in the store, 16/9 not matching its option)
 * would ship silently.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import FilmTuningSection from '../../../src/components/DebugPanel/FilmTuningSection/FilmTuningSection';
import { DEFAULT_FILM } from '../../../src/data/film/filmDefaults';

function renderSection(letterboxAspect: number) {
  const onLetterboxAspectChange = vi.fn<(aspect: number) => void>();
  const view = render(
    <FilmTuningSection
      {...DEFAULT_FILM}
      letterboxAspect={letterboxAspect}
      onEnabledChange={vi.fn()}
      onLetterboxChange={vi.fn()}
      onLetterboxAspectChange={onLetterboxAspectChange}
      onGradeChange={vi.fn()}
      onGlowChange={vi.fn()}
    />,
  );
  const select = view.container.querySelector<HTMLSelectElement>('select')!;
  return { select, onLetterboxAspectChange };
}

describe('FilmTuningSection', () => {
  it('shows the current ratio as the selected option', () => {
    const { select } = renderSection(16 / 9);
    expect(select.selectedOptions[0]!.textContent).toBe('16:9');
  });

  it('changing the ratio hands back a number', () => {
    const { select, onLetterboxAspectChange } = renderSection(2.39);
    fireEvent.change(select, { target: { value: String(9 / 16) } });
    expect(onLetterboxAspectChange).toHaveBeenCalledExactlyOnceWith(9 / 16);
  });
});
