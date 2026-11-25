// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogLoadOutcome } from '../../../../../tools/mcpm-workbench/@types/CatalogLoadOutcome';
import type { UserCatalog } from '../../../../../tools/mcpm-workbench/@types/UserCatalog';
import { rootReducer } from '../../../../../tools/mcpm-workbench/src/store/rootReducer';
import DataPanel from '../../../../../tools/mcpm-workbench/src/ui/DataPanel/DataPanel';
import LoadCatalogDialog from '../../../../../tools/mcpm-workbench/src/ui/LoadCatalogDialog/LoadCatalogDialog';
import { parseCatalogFiles } from '../../../../../tools/mcpm-workbench/src/ui/LoadCatalogDialog/utils/parseCatalogFiles';

vi.mock(
  '../../../../../tools/mcpm-workbench/src/ui/LoadCatalogDialog/utils/parseCatalogFiles',
  () => ({
    parseCatalogFiles: vi.fn(),
  }),
);
const parse = vi.mocked(parseCatalogFiles);

// jsdom has HTMLDialogElement but no showModal/close.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
beforeEach(() => parse.mockReset());

const csv = (name: string): File => new File(['1,2,3,0.02\n'], name, { type: 'text/csv' });

function drop(file: File): void {
  const event = new Event('drop', { cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
  act(() => void window.dispatchEvent(event));
}

function deferred(): {
  promise: Promise<CatalogLoadOutcome>;
  resolve: (o: CatalogLoadOutcome) => void;
} {
  let resolve!: (o: CatalogLoadOutcome) => void;
  const promise = new Promise<CatalogLoadOutcome>((r) => (resolve = r));
  return { promise, resolve };
}

const ready = (fileName: string): CatalogLoadOutcome => ({
  kind: 'ready',
  catalog: { fileName } as UserCatalog,
});

function setup(ui: ReactNode) {
  const store = configureStore({ reducer: rootReducer });
  render(<Provider store={store}>{ui}</Provider>);
  return { loaded: () => store.getState().catalog.userCatalog?.fileName ?? null };
}

function Controlled(): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <LoadCatalogDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

const dialog = (): HTMLDialogElement => document.querySelector('dialog')!;
const loadButton = (): HTMLElement =>
  screen.getByRole('button', { name: 'Load catalog', hidden: true });

describe('LoadCatalogDialog', () => {
  it('refuses a weight scale of 0 at the field, without reading the file', () => {
    setup(<Controlled />);
    drop(csv('a.csv'));
    const scale = screen.getByLabelText('Weight scale');
    fireEvent.change(scale, { target: { value: '0' } });
    fireEvent.click(loadButton());
    expect(parse).not.toHaveBeenCalled();
    expect(screen.getByRole('alert', { hidden: true })).toHaveTextContent(
      'Use a scale greater than 0.',
    );
    expect(scale).toHaveAttribute('aria-invalid', 'true');
  });

  it('drops a read cancelled by closing, even after reopening', async () => {
    const read = deferred();
    parse.mockReturnValueOnce(read.promise);
    const { loaded } = setup(<Controlled />);
    drop(csv('a.csv'));
    fireEvent.click(loadButton());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', hidden: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await act(async () => read.resolve(ready('a.csv')));
    expect(loaded()).toBeNull();
    expect(dialog()).toHaveAttribute('open');
  });

  it('uses only the latest read when another file is dropped during a read', async () => {
    const first = deferred();
    const second = deferred();
    parse.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { loaded } = setup(<Controlled />);
    drop(csv('a.csv'));
    fireEvent.click(loadButton());
    drop(csv('b.csv'));
    fireEvent.click(loadButton());
    await act(async () => first.resolve(ready('a.csv')));
    expect(loaded()).toBeNull();
    await act(async () => second.resolve(ready('b.csv')));
    expect(loaded()).toBe('b.csv');
  });

  it('opens on a page drop while the Data section is folded', () => {
    setup(<DataPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Data' }));
    expect(screen.getByRole('button', { name: 'Data' })).toHaveAttribute('aria-expanded', 'false');
    drop(csv('a.csv'));
    expect(dialog()).toHaveAttribute('open');
    expect(screen.getByText('a.csv')).toBeInTheDocument();
  });
});
