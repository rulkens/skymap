// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PairingOverlayContainer from '../../../src/components/containers/PairingOverlayContainer';
import { useAppSelector } from '../../../src/store/hooks';

vi.mock('../../../src/store/hooks', () => ({ useAppSelector: vi.fn() }));

describe('PairingOverlay', () => {
  it('shows the code and the address while waiting', () => {
    vi.mocked(useAppSelector).mockReturnValue({
      phase: 'waiting',
      code: 'K7M2Q9XA',
      pairingUrl: 'http://192.168.1.20:5173/remote.html#K7M2Q9XA',
    });
    render(<PairingOverlayContainer />);
    expect(screen.getByText('K7M2Q9XA')).toBeTruthy();
    expect(screen.getByText('http://192.168.1.20:5173/remote.html#K7M2Q9XA')).toBeTruthy();
    expect(screen.getByRole('img', { name: /QR code/ }).querySelector('path')).not.toBeNull();
  });

  it('under ?dome offers the code as text and no flat DOM card', () => {
    window.history.replaceState(null, '', '/?dome');
    vi.mocked(useAppSelector).mockReturnValue({
      phase: 'waiting',
      code: 'K7M2Q9XA',
      pairingUrl: 'http://192.168.1.20:5173/remote.html#K7M2Q9XA',
    });
    render(<PairingOverlayContainer />);
    window.history.replaceState(null, '', '/');
    expect(screen.getByRole('status').textContent).toContain('K7M2Q9XA');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders nothing once paired', () => {
    vi.mocked(useAppSelector).mockReturnValue({
      phase: 'paired',
      code: 'K7M2Q9XA',
      pairingUrl: 'http://192.168.1.20:5173/remote.html#K7M2Q9XA',
    });
    const { container } = render(<PairingOverlayContainer />);
    expect(container.firstChild).toBeNull();
  });
});
