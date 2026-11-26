// @vitest-environment jsdom
/**
 * The Selection padding field can be cleared while typing without the store ever
 * holding an empty or negative padding: the field's own text and the store's
 * refusal only hold together through the container's wiring.
 */
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import { rootReducer } from '../../../../../../tools/mcpm-workbench/src/store/rootReducer';
import SelectionControlsContainer from '../../../../../../tools/mcpm-workbench/src/ui/containers/grid/SelectionControlsContainer';

function renderPanel() {
  const store = configureStore({ reducer: rootReducer });
  render(
    <Provider store={store}>
      <SelectionControlsContainer />
    </Provider>,
  );
  return { store, field: screen.getByRole('spinbutton') as HTMLInputElement };
}

describe('SelectionControls padding field', () => {
  it('can be cleared mid-edit while the store keeps the last padding', () => {
    const { store, field } = renderPanel();
    fireEvent.change(field, { target: { value: '' } });
    expect(field.value).toBe('');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(store.getState().grid.paddingMpc).toBe(5);
    fireEvent.change(field, { target: { value: '12' } });
    expect(store.getState().grid.paddingMpc).toBe(12);
    expect(field.getAttribute('aria-invalid')).toBe('false');
  });

  it('shows the stored padding again when left empty or negative', () => {
    const { store, field } = renderPanel();
    fireEvent.change(field, { target: { value: '-60' } });
    expect(store.getState().grid.paddingMpc).toBe(5);
    fireEvent.blur(field);
    expect(field.value).toBe('5');
  });
});
