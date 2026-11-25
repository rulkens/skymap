// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogContents } from '../../../../../tools/mcpm-workbench/@types/CatalogContents';
import { rootReducer } from '../../../../../tools/mcpm-workbench/src/store/rootReducer';
import DataPanel from '../../../../../tools/mcpm-workbench/src/ui/DataPanel/DataPanel';
import LoadCatalogDialog from '../../../../../tools/mcpm-workbench/src/ui/LoadCatalogDialog/LoadCatalogDialog';
import { parseCatalogContents } from '../../../../../tools/mcpm-workbench/src/ui/LoadCatalogDialog/utils/parseCatalogContents';
import { readCatalogContents } from '../../../../../tools/mcpm-workbench/src/ui/LoadCatalogDialog/utils/readCatalogContents';

vi.mock(
  '../../../../../tools/mcpm-workbench/src/ui/LoadCatalogDialog/utils/readCatalogContents',
  () => ({ readCatalogContents: vi.fn() }),
);
// The real parser, watched: a load must not parse again.
vi.mock(
  '../../../../../tools/mcpm-workbench/src/ui/LoadCatalogDialog/utils/parseCatalogContents',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../../tools/mcpm-workbench/src/ui/LoadCatalogDialog/utils/parseCatalogContents')
      >();
    return { parseCatalogContents: vi.fn(actual.parseCatalogContents) };
  },
);
const read = vi.mocked(readCatalogContents);
const parse = vi.mocked(parseCatalogContents);

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
beforeEach(() => {
  read.mockReset();
  parse.mockClear();
});

const csv = (name: string): File => new File([''], name, { type: 'text/csv' });
const contents = (fileName: string, text: string): CatalogContents => ({
  kind: 'csv',
  fileName,
  text,
});
// Two rows: x from -4 to 1, weights 0.02 and 0.04.
const TWO_ROWS = '1,2,3,0.02\n-4,5,-6,0.04\n';

function drop(file: File): void {
  const event = new Event('drop', { cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
  act(() => void window.dispatchEvent(event));
}

function deferred(): {
  promise: Promise<CatalogContents>;
  resolve: (c: CatalogContents) => Promise<void>;
} {
  let settle!: (c: CatalogContents) => void;
  const promise = new Promise<CatalogContents>((r) => (settle = r));
  // The first parse waits a zero timeout after the read.
  const resolve = async (c: CatalogContents): Promise<void> => {
    await act(async () => settle(c));
    await act(() => new Promise((r) => setTimeout(r, 0)));
  };
  return { promise, resolve };
}

function setup(ui: ReactNode) {
  const store = configureStore({ reducer: rootReducer });
  render(<Provider store={store}>{ui}</Provider>);
  return { loaded: () => store.getState().catalog.userCatalog ?? null };
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
const loadButton = (name = 'Load catalog'): HTMLElement =>
  screen.getByRole('button', { name, hidden: true });
// The file contents section as one line of text, or null while it is not mounted.
const info = (): string | null =>
  document.querySelector('section[aria-label="File contents"] > div')?.textContent ?? null;
const EMPTY = '— rows · weight —x —y —z — Mpc';

describe('LoadCatalogDialog', () => {
  it('shows what a dropped file holds once read, and loads that parse without another', async () => {
    const file = deferred();
    read.mockReturnValueOnce(file.promise);
    const { loaded } = setup(<Controlled />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(info()).toBeNull();
    drop(csv('a.csv'));
    expect(info()).toBe(EMPTY);
    expect(loadButton()).toBeDisabled();

    await file.resolve(contents('a.csv', TWO_ROWS));
    expect(info()).toBe('2 rows · weight 0.03 ± 0.01x -4…1y 2…5z -6…3 Mpc');
    expect(loadButton()).toHaveFocus();

    fireEvent.click(loadButton());
    expect(loaded()?.points.count).toBe(2);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('parses again from memory when a setting changes, never reading the file twice', async () => {
    const file = deferred();
    read.mockReturnValueOnce(file.promise);
    setup(<Controlled />);
    drop(csv('a.csv'));
    await file.resolve(contents('a.csv', TWO_ROWS));

    fireEvent.change(screen.getByLabelText('Weight scale'), { target: { value: '2' } });
    expect(loadButton()).toBeDisabled();
    await waitFor(() => expect(info()).toMatch(/weight 0\.06 ± 0\.02/));
    expect(loadButton()).toBeEnabled();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('holds the parse while a field is wrong, and Enter names the field', async () => {
    const file = deferred();
    read.mockReturnValueOnce(file.promise);
    setup(<Controlled />);
    drop(csv('a.csv'));
    await file.resolve(contents('a.csv', TWO_ROWS));

    const scale = screen.getByLabelText('Weight scale');
    fireEvent.change(scale, { target: { value: '0' } });
    fireEvent.keyDown(scale, { key: 'Enter' });
    expect(screen.getByRole('alert', { hidden: true })).toHaveTextContent(
      'Use a scale greater than 0.',
    );
    expect(loadButton()).toBeDisabled();
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('uses only the latest read when another file is dropped during a read', async () => {
    const first = deferred();
    const second = deferred();
    read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    setup(<Controlled />);
    drop(csv('a.csv'));
    drop(csv('b.csv'));
    await first.resolve(contents('a.csv', TWO_ROWS));
    expect(info()).toBe(EMPTY);
    expect(loadButton()).toBeDisabled();
    await second.resolve(contents('b.csv', '1,2,3,0.02\n'));
    expect(info()).toMatch(/^1 rows/);
  });

  it('reads the file again when closed during a read and opened again', async () => {
    const dropped = deferred();
    const reopened = deferred();
    read.mockReturnValueOnce(dropped.promise).mockReturnValueOnce(reopened.promise);
    setup(<Controlled />);
    drop(csv('a.csv'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', hidden: true }));
    await dropped.resolve(contents('a.csv', TWO_ROWS));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(info()).toBe(EMPTY);
    await reopened.resolve(contents('a.csv', TWO_ROWS));
    expect(info()).toMatch(/^2 rows/);
  });

  it('loads a file with a weight warning in one click', async () => {
    const file = deferred();
    read.mockReturnValueOnce(file.promise);
    const { loaded } = setup(<Controlled />);
    drop(csv('a.csv'));
    await file.resolve(contents('a.csv', '1,2,3,20\n'));
    expect(screen.getByText(/^Median weight is 20\./)).toBeInTheDocument();
    fireEvent.click(loadButton('Load anyway'));
    expect(loaded()?.fileName).toBe('a.csv');
  });

  it('opens on a page drop while the Data section is folded', () => {
    read.mockReturnValue(new Promise(() => {}));
    setup(<DataPanel id="data" collapsed={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Data' }));
    expect(screen.getByRole('button', { name: 'Data' })).toHaveAttribute('aria-expanded', 'false');
    drop(csv('a.csv'));
    expect(dialog()).toHaveAttribute('open');
    expect(screen.getByText('a.csv')).toBeInTheDocument();
  });

  // jsdom ignores `inert`, so the guard is the dialog's place: outside the
  // collapsed aside's inert subtree.
  it('opens on a page drop while the data sidebar is collapsed, outside the inert aside', () => {
    read.mockReturnValue(new Promise(() => {}));
    setup(<DataPanel id="data" collapsed />);
    expect(document.getElementById('data')).toHaveAttribute('inert');
    drop(csv('a.csv'));
    expect(dialog()).toHaveAttribute('open');
    expect(dialog().closest('[inert]')).toBeNull();
  });
});
