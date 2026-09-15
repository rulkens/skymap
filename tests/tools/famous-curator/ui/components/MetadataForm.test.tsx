// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MetadataForm } from '../../../../../tools/famous-curator/ui/components/MetadataForm';

describe('MetadataForm', () => {
  it('typing into license calls onChange with the merged metadata', () => {
    const onChange = vi.fn();
    render(
      <MetadataForm
        metadata={{ sourceUrl: 'https://a', license: '', author: 'Alice' }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/license/i), { target: { value: 'CC-BY-SA' } });
    expect(onChange).toHaveBeenCalledWith({
      sourceUrl: 'https://a',
      license: 'CC-BY-SA',
      author: 'Alice',
    });
  });
});
