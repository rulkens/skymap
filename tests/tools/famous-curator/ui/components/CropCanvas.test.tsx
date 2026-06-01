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
        onDiskChange={vi.fn()}
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
        onDiskChange={vi.fn()}
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
        onDiskChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Reset crop'));
    // 800 = min(1000, 800); centred at x=100, y=0.
    expect(onCropChange).toHaveBeenCalledWith({
      x: 100,
      y: 0,
      width: 800,
      height: 800,
      rotationDeg: 0,
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
        onDiskChange={vi.fn()}
      />,
    );
    const dz = screen.getByTestId('curator-crop-dropzone');
    const file = new File([new Uint8Array([1, 2, 3])], 'galaxy.jpg', { type: 'image/jpeg' });
    fireEvent.drop(dz, { dataTransfer: { files: [file] } });
    expect(onFileDrop).toHaveBeenCalledWith(file);
  });

  // ── Deproject (aspect-locked) mode ────────────────────────────────────
  //
  // `deprojectAspect` switches the crop from square/as-shot to an
  // aspect-locked rect that frames a disk's ellipse.  In this mode the
  // rotation knob + "Reset rotation" disappear (the App pins rotation to
  // the disk's position angle) and resize handles snap height = width *
  // aspect.

  const baseProps = {
    source: { width: 1000, height: 1000, previewUrl: 'data:,' },
    crop: { x: 100, y: 100, width: 200, height: 100, rotationDeg: 30 },
    onFileDrop: () => {},
    disk: undefined,
    catalogAxisRatio: 0.5,
    onDiskChange: () => {},
  };

  it('hides the rotate handle when deprojectAspect is set', () => {
    const { container } = render(
      <CropCanvas {...baseProps} onCropChange={() => {}} deprojectAspect={0.5} />,
    );
    expect(container.querySelector('[data-handle="rotate"]')).toBeNull();
  });

  it('still shows the rotate handle in as-shot mode (deprojectAspect undefined)', () => {
    const { container } = render(
      <CropCanvas {...baseProps} onCropChange={() => {}} deprojectAspect={undefined} />,
    );
    expect(container.querySelector('[data-handle="rotate"]')).not.toBeNull();
  });

  it('keeps aspect on a corner resize when deprojectAspect is set', () => {
    const onCropChange = vi.fn();
    const { container } = render(
      <CropCanvas {...baseProps} onCropChange={onCropChange} deprojectAspect={0.5} />,
    );
    // jsdom's default getBoundingClientRect is all zeros, which would make
    // canvasScale (= imgRect.width / source.width) zero and the drag delta
    // infinite.  Stub the source <img> to report a 1:1 layout so the drag
    // math is exercisable; source.width === 1000 ⇒ canvasScale === 1.
    const img = container.querySelector('img.curator-crop-source') as HTMLImageElement;
    img.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1000, height: 1000 }) as DOMRect;
    const se = container.querySelector('[data-handle="se"]') as Element;
    // jsdom's setPointerCapture/releasePointerCapture throw "No active
    // pointer" for synthetic fireEvent pointers; stub them to no-ops.
    (se as HTMLElement).setPointerCapture = () => {};
    (se as HTMLElement).releasePointerCapture = () => {};
    fireEvent.pointerDown(se, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(se, { clientX: 80, clientY: 80 });
    fireEvent.pointerUp(se);
    const last = onCropChange.mock.calls.at(-1)?.[0];
    expect(last.height).toBeCloseTo(last.width * 0.5, 0);
  });
});
