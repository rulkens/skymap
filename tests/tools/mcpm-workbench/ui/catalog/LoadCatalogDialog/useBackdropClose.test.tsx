// @vitest-environment jsdom
// jsdom, like Safari, has no `closedBy`: these exercise the fallback a browser without it gets.
import { fireEvent, render } from '@testing-library/react';
import { useRef, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useBackdropClose } from '../../../../../../tools/mcpm-workbench/src/ui/catalog/LoadCatalogDialog/useBackdropClose';

function Harness(): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);
  useBackdropClose(ref);
  return (
    <dialog ref={ref} open>
      <p>inside</p>
    </dialog>
  );
}

function setup() {
  const { container } = render(<Harness />);
  const dialog = container.querySelector('dialog')!;
  dialog.getBoundingClientRect = () => new DOMRect(100, 100, 200, 200);
  dialog.close = vi.fn();
  return dialog;
}

describe('useBackdropClose', () => {
  it('closes on a click that starts and ends on the backdrop', () => {
    const dialog = setup();
    fireEvent.pointerDown(dialog, { clientX: 20, clientY: 20 });
    fireEvent.click(dialog, { clientX: 20, clientY: 20 });
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });

  it('stays open when a text selection started inside is released on the backdrop', () => {
    const dialog = setup();
    fireEvent.pointerDown(dialog, { clientX: 150, clientY: 150 });
    fireEvent.click(dialog, { clientX: 20, clientY: 20 });
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it('stays open on a click inside the dialog box', () => {
    const dialog = setup();
    fireEvent.pointerDown(dialog, { clientX: 150, clientY: 150 });
    fireEvent.click(dialog, { clientX: 150, clientY: 150 });
    expect(dialog.close).not.toHaveBeenCalled();
  });
});
