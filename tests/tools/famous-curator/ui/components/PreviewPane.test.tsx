// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviewPane } from '../../../../../tools/famous-curator/ui/components/PreviewPane';

describe('PreviewPane', () => {
  it('renders placeholders when no previews exist', () => {
    render(<PreviewPane previews={{}} />);
    expect(screen.getByText(/no starless preview yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no alpha preview yet/i)).toBeInTheDocument();
  });

  it('renders starless + alpha images when both URLs are set', () => {
    render(<PreviewPane previews={{ starless: '/s.webp', alpha: '/a.webp' }} />);
    const starless = screen.getByAltText('starless') as HTMLImageElement;
    const alpha = screen.getByAltText('alpha') as HTMLImageElement;
    expect(starless.src.endsWith('/s.webp')).toBe(true);
    expect(alpha.src.endsWith('/a.webp')).toBe(true);
  });
});
