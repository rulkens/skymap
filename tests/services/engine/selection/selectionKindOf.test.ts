/**
 * The lookup holds only what boot installed: a read before install, or of a kind the installed
 * composition does not declare, is a bug that must throw rather than fall back.
 */

import { describe, expect, it, vi } from 'vitest';
import type { SelectionKindFacts } from '../../../../src/@types/engine/layer/SelectionKindFacts';

const MODULE = '../../../../src/services/engine/selection/selectionKindOf';

const kind = (type: string) => ({ type }) as SelectionKindFacts;

async function freshLookup() {
  vi.resetModules();
  return (await import(
    MODULE
  )) as typeof import('../../../../src/services/engine/selection/selectionKindOf');
}

describe('selectionKindOf', () => {
  it('throws before any kinds are installed', async () => {
    const { selectionKindOf } = await freshLookup();
    expect(() => selectionKindOf('body')).toThrow(/no kinds installed/);
  });

  it('returns the installed facts and throws on an undeclared type', async () => {
    const { installSelectionKinds, selectionKindOf } = await freshLookup();
    const body = kind('body');
    installSelectionKinds([body, kind('craft')]);
    expect(selectionKindOf('body')).toBe(body);
    expect(() => selectionKindOf('globularCluster')).toThrow(/globularCluster/);
  });
});
