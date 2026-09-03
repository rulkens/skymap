/**
 * upsertGroup mirrors upsertAsset's identity-preserving replace-or-append
 * for scenes.json's rows; task 9 writes through it directly, so a
 * same-type bug (e.g. comparing the wrong field) needs its own catch here
 * rather than riding on upsertAsset's coverage.
 */
import { describe, it, expect } from 'vitest';
import { upsertGroup } from '../../../../tools/scene-recon/manifest/upsertGroup';
import type { GroupRegistry } from '../../../../tools/scene-workbench/@types/GroupRegistry';
import type { GroupRegistryEntry } from '../../../../tools/scene-workbench/@types/GroupRegistryEntry';

function makeEntry(id: string): GroupRegistryEntry {
  return { id, name: id, manifestUrl: `${id}/manifest.json` };
}

describe('upsertGroup', () => {
  it('replaces the named entry and appends an unknown id', () => {
    const g1 = makeEntry('g1');
    const g2 = makeEntry('g2');
    const registry: GroupRegistry = { formatVersion: 1, groups: [g1, g2] };
    const replacement = { ...makeEntry('g1'), name: 'Renamed' };

    const replaced = upsertGroup(registry, replacement);
    expect(replaced.groups[0]).toBe(replacement);
    expect(replaced.groups[1]).toBe(g2);
    expect(replaced.groups).toHaveLength(2);

    const newEntry = makeEntry('g3');
    const appended = upsertGroup(registry, newEntry);
    expect(appended.groups[0]).toBe(g1);
    expect(appended.groups[1]).toBe(g2);
    expect(appended.groups[2]).toBe(newEntry);
    expect(appended.groups).toHaveLength(3);
  });
});
