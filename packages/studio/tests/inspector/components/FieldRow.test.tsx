// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Provider } from 'react-redux';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  atPoint,
  fade,
  flyPath,
  oscillate,
  scene,
  show,
} from '../../../../../src/services/engine/animation/effectHelpers';
import { setFlowEnabled } from '../../../../../src/layers/flow/state/flow/slice';
import { setLabelsFocusedOnly } from '../../../../../src/state/settings/core/labelsSlice';
import FieldRow from '../../../src/inspector/components/FieldRow/FieldRow';
import { inspectorSpec } from '../../../src/inspector/utils/inspectorSpec';
import { rowSubject } from '../../../src/draft/utils/rowSubject';
import { openStudioStore } from '../../helpers/openStudioStore';
import { selectDraft, selectStudioState } from '../../../src/session/state/selectors';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { RowKind } from '../../../src/@types/rows/RowKind';
import type { RowRef } from '../../../src/@types/rows/RowRef';

afterEach(cleanup);

const EFFECT = { kind: 'effect', path: [0] } as const;

const START_POSE = {
  target: [0, 0, 0] as [number, number, number],
  yaw: 0,
  pitch: 0,
  distance: 300,
};

function setup(draft: ClipData, kind: RowKind, rowRef: RowRef, fieldKey: string) {
  const store = openStudioStore(draft, { resolve: false });
  const spec = inspectorSpec(kind).fields.find((f) => f.key === fieldKey)!;
  const subject = rowSubject(selectDraft(store.getState())!, rowRef)!;
  render(
    <Provider store={store}>
      <FieldRow spec={spec} subject={subject} rowRef={rowRef} />
    </Provider>,
  );
  return store;
}

describe('FieldRow', () => {
  it('editing Distance to 950 dispatches one paramEdited with 950 and the field label', async () => {
    const store = setup(
      { start: START_POSE, timeline: [] },
      'start',
      { kind: 'start' },
      'distance',
    );
    const field = screen.getByRole('textbox', { name: 'Distance' });
    await userEvent.clear(field);
    await userEvent.type(field, '950{Enter}');

    const state = selectStudioState(store.getState());
    expect((state.draft!.start as typeof START_POSE).distance).toBe(950);
    expect(state.history.past).toHaveLength(1);
    expect(state.history.past[0]!.label).toBe('Distance');
  });

  it('reset clears an optional param', async () => {
    const store = setup(
      { timeline: [oscillate('distance', { amp: 5, period: 4, fade: 2 })] },
      'osc',
      { kind: 'effect', path: [0] },
      'fade',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reset Fade to default' }));

    expect(selectDraft(store.getState())!.timeline[0]).not.toHaveProperty('fade');
  });

  it('Enter on an unchanged degrees field adds no Undo, though the radian round trip is inexact', async () => {
    const store = setup(
      { start: { ...START_POSE, yaw: 0.1 }, timeline: [] },
      'start',
      { kind: 'start' },
      'yaw',
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Turn' }), '{Enter}');

    expect(selectStudioState(store.getState()).history.past).toHaveLength(0);
  });

  it('an unset param the engine decides reads auto and takes a typed value', async () => {
    const store = setup(
      { timeline: [oscillate('distance', { amp: 5, period: 4 })] },
      'osc',
      { kind: 'effect', path: [0] },
      'over',
    );
    const field = screen.getByRole('textbox', { name: 'Window' });
    expect(field).toHaveValue('');
    expect(field).toHaveAttribute('placeholder', 'auto');
    expect(screen.queryByRole('button', { name: /Reset/ })).toBeNull();

    await userEvent.type(field, '6{Enter}');
    expect(selectDraft(store.getState())!.timeline[0]).toMatchObject({ over: 6 });
  });

  it.each([
    ['osc', 'period', 'Period', oscillate('distance', { amp: 5, period: 4 })],
    ['flyPath', 'align', 'Align-in', flyPath([atPoint([5, 0, 0], 8)], { over: 10, align: 2 })],
  ] as const)(
    'a %s %s of 0 is held above 0: the engine divides by it',
    async (kind, key, label, effect) => {
      const store = setup({ timeline: [effect] }, kind, EFFECT, key);
      const field = screen.getByRole('textbox', { name: label });
      await userEvent.clear(field);
      await userEvent.type(field, '0{Enter}');

      expect(
        (selectDraft(store.getState())!.timeline[0] as unknown as Record<string, number>)[key],
      ).toBeGreaterThan(0);
    },
  );

  it('a degrees field dispatches radians', async () => {
    const store = setup({ start: START_POSE, timeline: [] }, 'start', { kind: 'start' }, 'yaw');
    const field = screen.getByRole('textbox', { name: 'Turn' });
    await userEvent.clear(field);
    await userEvent.type(field, '90{Enter}');

    expect((selectDraft(store.getState())!.start as typeof START_POSE).yaw).toBeCloseTo(
      Math.PI / 2,
      10,
    );
  });

  it('a show picks layers and their items; the last one checked cannot be unchecked', async () => {
    const store = setup({ timeline: [show(['flow'])] }, 'show', EFFECT, 'args');
    await userEvent.click(screen.getByRole('button', { name: 'Layers: flow' }));
    // The field holds the subject it rendered with, so the one check left is the stored ['flow'].
    expect(screen.getByRole('checkbox', { name: 'flow' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'milliquas' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'milkyWay labels' }));

    const args = (selectDraft(store.getState())!.timeline[0] as { args: string[] }).args;
    expect(args).toEqual(['flow', 'label:milkyWay']);
  });

  it('a fade offers whole layers only, not their items', async () => {
    setup({ timeline: [fade(['flow'], 0, 1)] }, 'fade', EFFECT, 'args');
    await userEvent.click(screen.getByRole('button', { name: 'Layers: flow' }));

    expect(screen.getByRole('checkbox', { name: 'survey' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'milliquas' })).toBeNull();
  });

  it('a Set step switches its setting and keeps the on/off value', async () => {
    const store = setup({ timeline: [scene(setFlowEnabled(true))] }, 'scene', EFFECT, 'action');
    const action = () => (selectDraft(store.getState())!.timeline[0] as { action: unknown }).action;

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Setting' }), 'labels');
    expect(action()).toEqual(setLabelsFocusedOnly(true));
  });

  it('a catalog Set step offers the catalogs and an on/off', async () => {
    const store = setup({ timeline: [scene(setFlowEnabled(false))] }, 'scene', EFFECT, 'action');
    expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Setting' }), 'catalog');
    const { payload } = (
      selectDraft(store.getState())!.timeline[0] as {
        action: { payload: { id: string; enabled: boolean } };
      }
    ).action;
    expect(payload).toEqual({ id: 'famousGalaxy', enabled: false });
  });
});
