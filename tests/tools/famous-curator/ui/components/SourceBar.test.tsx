// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SourceBar } from '../../../../../tools/famous-curator/ui/components/SourceBar';

describe('SourceBar', () => {
  it('fetches on Enter in the URL field', () => {
    const onFetch = vi.fn();
    render(<SourceBar onFetch={onFetch} />);
    const input = screen.getByLabelText(/source url/i);
    fireEvent.change(input, { target: { value: 'https://example.com/m81.jpg' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onFetch).toHaveBeenCalledWith('https://example.com/m81.jpg');
  });

  it('does not fetch on Enter when the field is empty', () => {
    const onFetch = vi.fn();
    render(<SourceBar onFetch={onFetch} />);
    fireEvent.keyDown(screen.getByLabelText(/source url/i), { key: 'Enter' });
    expect(onFetch).not.toHaveBeenCalled();
  });

  it('does not fetch on Enter while a fetch is in flight (busy)', () => {
    const onFetch = vi.fn();
    render(<SourceBar busy onFetch={onFetch} />);
    const input = screen.getByLabelText(/source url/i);
    fireEvent.change(input, { target: { value: 'https://example.com/m81.jpg' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onFetch).not.toHaveBeenCalled();
  });

  it('still fetches via the button click', () => {
    const onFetch = vi.fn();
    render(<SourceBar onFetch={onFetch} />);
    fireEvent.change(screen.getByLabelText(/source url/i), {
      target: { value: 'https://example.com/m81.jpg' },
    });
    fireEvent.click(screen.getByRole('button', { name: /fetch/i }));
    expect(onFetch).toHaveBeenCalledWith('https://example.com/m81.jpg');
  });
});
