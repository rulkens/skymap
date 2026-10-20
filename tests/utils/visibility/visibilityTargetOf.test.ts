import { describe, expect, it } from 'vitest';

import { APP_VISIBILITY } from '../../../src/compositions/appVisibility';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';
import { setVisibility } from '../../../src/state/settings/setVisibilityAction';
import settingsReducer from '../../../src/state/settings/settingsReducer';
import { visibilityTargetOf } from '../../../src/utils/visibility/visibilityTargetOf';
import type { VisibilityEntry } from '../../../src/@types/engine/layer/VisibilityEntry';
import type { VisibilityGates } from '../../../src/@types/engine/state/VisibilityGates';
import type { SetVisibilityPayload } from '../../../src/@types/settings/SetVisibilityPayload';

const ENTRIES: readonly VisibilityEntry[] = APP_VISIBILITY;
const show = (key: string) => ENTRIES.find((e) => 'key' in e && e.key === key)!;
const label = (name: string) => ENTRIES.find((e) => 'label' in e && e.label === name)!;
const write = (...payloads: SetVisibilityPayload[]) =>
  payloads.reduce((s, p) => settingsReducer(s, setVisibility(p)), INITIAL_SETTINGS);
const committed = { committed: () => ({ kind: 'ready', req: {}, value: 1, loadedAtMs: 0 }) };
const empty = { committed: () => null };
const gates = (entries: Record<string, typeof committed | typeof empty>): VisibilityGates =>
  new Map(Object.entries(entries)) as unknown as VisibilityGates;

describe('visibilityTargetOf', () => {
  it.each([
    [true, true, 1],
    [true, false, 0],
    [false, true, 0],
    [false, false, 0],
  ] as const)('switch %s × present %s → %i', (on, present, expected) => {
    const settings = write({ cluster: 'flow', field: 'enabled', on });
    const gate = gates({ flow: present ? committed : empty });
    expect(visibilityTargetOf(settings, ENTRIES, show('flow'), undefined, gate)).toBe(expected);
  });

  it('an ungated entry is present', () => {
    const settings = write({ cluster: 'lightTime', field: 'enabled', on: true });
    expect(visibilityTargetOf(settings, ENTRIES, show('lightTime'), undefined, gates({}))).toBe(1);
  });

  it('a per-item entry resolves per item', () => {
    const gate = gates({ 'survey:sdss': committed, 'survey:glade': empty });
    const target = (item: string) =>
      visibilityTargetOf(INITIAL_SETTINGS, ENTRIES, show('survey'), item, gate);
    expect(target('sdss')).toBe(1);
    expect(target('glade')).toBe(0);
  });

  it("a label with of is off while its thing's target is off", () => {
    const on = { field: 'labelEnabled', on: true } as const;
    const settings = write(
      { cluster: 'constellations', ...on },
      { cluster: 'constellations', field: 'enabled', on: true },
    );
    const target = (gate: VisibilityGates) =>
      visibilityTargetOf(settings, ENTRIES, label('constellations'), undefined, gate);
    expect(target(gates({ constellations: empty }))).toBe(0);
    expect(target(gates({ constellations: committed }))).toBe(1);
  });

  it('a per-item of label follows its own item', () => {
    const settings = write(
      { cluster: 'structures', item: 'void', field: 'enabled', on: false },
      { cluster: 'structures', item: 'supercluster', field: 'enabled', on: true },
      { cluster: 'structures', item: 'void', field: 'labelEnabled', on: true },
      { cluster: 'structures', item: 'supercluster', field: 'labelEnabled', on: true },
    );
    const target = (item: string) =>
      visibilityTargetOf(settings, ENTRIES, label('structure'), item, gates({}));
    expect(target('void')).toBe(0);
    expect(target('supercluster')).toBe(1);
  });
});
