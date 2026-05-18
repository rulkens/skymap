// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MetadataForm } from '../../../../../tools/famous-curator/ui/components/MetadataForm';

describe('MetadataForm', () => {
  it('renders the three fields prefilled', () => {
    render(
      <MetadataForm
        metadata={{ sourceUrl: 'https://a', license: 'CC-BY', author: 'Alice' }}
        onChange={vi.fn()}
      />,
    );
    expect((screen.getByLabelText(/source url/i) as HTMLInputElement).value).toBe('https://a');
    expect((screen.getByLabelText(/license/i) as HTMLInputElement).value).toBe('CC-BY');
    expect((screen.getByLabelText(/author/i) as HTMLInputElement).value).toBe('Alice');
  });

  it('typing into license calls onChange with the merged metadata', () => {
    const onChange = vi.fn();
    render(
      <MetadataForm
        metadata={{ sourceUrl: 'https://a', license: '', author: 'Alice' }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/license/i), { target: { value: 'CC-BY-SA' } });
    expect(onChange).toHaveBeenCalledWith({ sourceUrl: 'https://a', license: 'CC-BY-SA', author: 'Alice' });
  });
});
