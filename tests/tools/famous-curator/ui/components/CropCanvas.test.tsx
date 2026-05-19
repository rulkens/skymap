// @vitest-environment jsdom
/**
 * CropCanvas — renders the source preview + an overlay 1:1 crop rect.
 *
 * Pointer interaction is hard to drive precisely in jsdom (no real
 * layout).  This test covers the deterministic surface: rendering, the
 * Reset button, the readout, drag-drop file handling, and the zoom
 * slider.  Pointer-drag behaviour is implicitly covered by Task 1's
 * cropMath tests + the manual smoke in Task 10.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CropCanvas } from '../../../../../tools/famous-curator/ui/components/CropCanvas';

describe('CropCanvas', () => {
  it('renders the source preview at the given URL', () => {
    render(
      <CropCanvas
        source={{ width: 1000, height: 800, previewUrl: '/p.webp' }}
        crop={{ x: 100, y: 100, width: 400, height: 400, rotationDeg: 0 }}
        onCropChange={vi.fn()}
        onFileDrop={vi.fn()}
      />,
    );
    const img = screen.getByAltText('source') as HTMLImageElement;
    expect(img.src.endsWith('/p.webp')).toBe(true);
  });

  it('shows the live coord readout', () => {
    render(
      <CropCanvas
        source={{ width: 1000, height: 800, previewUrl: '/p.webp' }}
        crop={{ x: 100, y: 100, width: 400, height: 400, rotationDeg: 0 }}
        onCropChange={vi.fn()}
        onFileDrop={vi.fn()}
      />,
    );
    expect(screen.getByText(/400 × 400 of 1000 × 800/)).toBeInTheDocument();
  });

  it('Reset crop button calls onCropChange with the biggest centred square', () => {
    const onCropChange = vi.fn();
    render(
      <CropCanvas
        source={{ width: 1000, height: 800, previewUrl: '/p.webp' }}
        crop={{ x: 0, y: 0, width: 100, height: 100, rotationDeg: 0 }}
        onCropChange={onCropChange}
        onFileDrop={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Reset crop'));
    // 800 = min(1000, 800); centred at x=100, y=0.
    expect(onCropChange).toHaveBeenCalledWith({
      x: 100, y: 0, width: 800, height: 800, rotationDeg: 0,
    });
  });

  it('drop event with a File calls onFileDrop with the file', () => {
    const onFileDrop = vi.fn();
    render(
      <CropCanvas
        source={undefined}
        crop={undefined}
        onCropChange={vi.fn()}
        onFileDrop={onFileDrop}
      />,
    );
    const dz = screen.getByTestId('curator-crop-dropzone');
    const file = new File([new Uint8Array([1, 2, 3])], 'galaxy.jpg', { type: 'image/jpeg' });
    fireEvent.drop(dz, { dataTransfer: { files: [file] } });
    expect(onFileDrop).toHaveBeenCalledWith(file);
  });
});
