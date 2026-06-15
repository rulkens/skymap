/**
 * selectionSubsystem — unit tests for the hover/select/focus slot store.
 *
 * Pure JS — no GPU, no DOM, no async.  The subsystem holds three slots,
 * each an already-resolved `FocusableTarget` (GalaxyInfo | StructureInfo)
 * or null; it resolves NOTHING itself, so the tests hand it pre-built
 * target fixtures and assert the slot/callback/wake behaviour.
 *
 * Coverage:
 *   - Dedup: redundant setHovered / setSelected calls fan out only on a
 *     real identity change (targetEq covers galaxy and structure variants).
 *   - The stored target is fanned out verbatim to the matching callback.
 *   - Cross-kind transitions replace the slot correctly.
 *   - Focus slot: setFocused is independent of setSelected, dedupes, and
 *     fires onFocusChange (not the selection callbacks).
 *   - Render wake: setSelected/setFocused wake on actual change; no-ops
 *     and setHovered stay wake-free.
 *   - destroy() clears state.
 */

import { describe, it, expect, vi } from 'vitest';

import { createSelectionSubsystem } from '../../../../src/services/engine/subsystems/selectionSubsystem';
import type { EngineCallbacks } from '../../../../src/@types/engine/EngineCallbacks';
import type { GalaxyInfo } from '../../../../src/@types/engine/GalaxyInfo';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import { Source } from '../../../../src/data/sources';
import type { SourceType } from '../../../../src/@types/data/SourceType';

type Callbacks = EngineCallbacks & {
  selection: { onHoverChange: ReturnType<typeof vi.fn>; onSelectChange: ReturnType<typeof vi.fn> };
  camera: { onFocusChange: ReturnType<typeof vi.fn> };
};

function makeCallbacks(): Callbacks {
  return {
    lifecycle: { onStatusChange: vi.fn() },
    selection: { onHoverChange: vi.fn(), onSelectChange: vi.fn() },
    camera: { onFocusChange: vi.fn() },
  } as unknown as Callbacks;
}

// Resolved target fixtures — identity fields only (targetEq dedupes on
// `source`/`index` for galaxies and `id` for structures; the rest is
// derived display data the slot store never inspects).
function galaxy(source: SourceType, index: number): GalaxyInfo {
  return { type: 'galaxyCatalog', source, index } as unknown as GalaxyInfo;
}

const VIRGO: StructureInfo = {
  type: 'structure',
  id: 'virgo',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};

const FORNAX: StructureInfo = {
  type: 'structure',
  id: 'fornax',
  name: 'Fornax Cluster',
  category: 'cluster',
  worldPos: [0, 10, 0],
  featured: true,
  physicalRadiusMpc: 1.5,
};

function makeSub(cb: Callbacks, opts: { requestRender?: () => void } = {}) {
  return createSelectionSubsystem({
    cb,
    requestRender: opts.requestRender ?? (() => {}),
  });
}

describe('createSelectionSubsystem — galaxy variant', () => {
  it('dedupes setHovered — fires onHoverChange only on real transitions', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb);

    // null → null is itself a no-op (targetEq).
    sub.setHovered(null);
    expect(cb.selection.onHoverChange).toHaveBeenCalledTimes(0);

    sub.setHovered(galaxy(Source.SDSS, 1));
    sub.setHovered(galaxy(Source.SDSS, 1)); // dup — same (source, index)
    sub.setHovered(galaxy(Source.SDSS, 2));
    expect(cb.selection.onHoverChange).toHaveBeenCalledTimes(2);
  });

  it('fans the stored galaxy target out to onSelectChange verbatim', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb);
    const target = galaxy(Source.SDSS, 5);

    sub.setSelected(target);

    expect(cb.selection.onSelectChange).toHaveBeenCalledWith(target);
    expect(sub.selected()).toBe(target);
  });
});

describe('createSelectionSubsystem — structure variant', () => {
  it('fans the hovered structure target out to onHoverChange verbatim', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb);

    sub.setHovered(VIRGO);

    expect(cb.selection.onHoverChange).toHaveBeenCalledWith(VIRGO);
  });

  it('fans the selected structure target out to onSelectChange verbatim', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb);

    sub.setSelected(VIRGO);

    expect(cb.selection.onSelectChange).toHaveBeenCalledWith(VIRGO);
  });

  it('dedupes same-structure sets — fires only on real transitions', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb);

    sub.setSelected(VIRGO);
    sub.setSelected(VIRGO); // dup — same id
    sub.setSelected(FORNAX);

    expect(cb.selection.onSelectChange).toHaveBeenCalledTimes(2);
  });
});

describe('createSelectionSubsystem — cross-kind transitions', () => {
  it('galaxy → structure selection fires onSelectChange once with the structure', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb);

    sub.setSelected(galaxy(Source.SDSS, 1));
    sub.setSelected(VIRGO);

    expect(cb.selection.onSelectChange).toHaveBeenLastCalledWith(VIRGO);
  });

  it('structure → galaxy hover replaces the slot', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb);
    const g = galaxy(Source.SDSS, 1);

    sub.setHovered(VIRGO);
    expect(cb.selection.onHoverChange).toHaveBeenLastCalledWith(VIRGO);

    sub.setHovered(g);
    expect(cb.selection.onHoverChange).toHaveBeenLastCalledWith(g);
    expect(sub.hovered()).toBe(g);
  });
});

describe('createSelectionSubsystem — focus slot', () => {
  it('setFocused updates focused() independently of selected()', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb);

    sub.setFocused(VIRGO);
    expect(sub.focused()).toBe(VIRGO);
    // Focus is its own rung — setting it does not pin the selection.
    expect(sub.selected()).toBeNull();
  });

  it('deselecting (setSelected null) leaves the focus slot intact', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb);

    sub.setFocused(VIRGO);
    sub.setSelected(VIRGO);
    sub.setSelected(null); // deselect — must NOT drop the fade's focus

    expect(sub.selected()).toBeNull();
    expect(sub.focused()).toBe(VIRGO);
  });

  it('setFocused fires onFocusChange with the target, not the selection callbacks', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb);

    sub.setFocused(VIRGO);

    // Symmetric with setSelected → onSelectChange: setFocused owns the
    // camera focus callback (which React mirrors into the URL hash).
    expect(cb.camera.onFocusChange).toHaveBeenCalledWith(VIRGO);
    expect(cb.selection.onSelectChange).not.toHaveBeenCalled();
    expect(cb.selection.onHoverChange).not.toHaveBeenCalled();
  });

  it('setFocused dedupes — re-focusing the same target fires onFocusChange once', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb);

    sub.setFocused(VIRGO);
    sub.setFocused(VIRGO); // dup — no refire
    expect(cb.camera.onFocusChange).toHaveBeenCalledTimes(1);
  });

  it('setFocused(null) fires onFocusChange(null)', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb);

    sub.setFocused(VIRGO);
    sub.setFocused(null);
    expect(cb.camera.onFocusChange).toHaveBeenLastCalledWith(null);
  });

  it('setFocused(null) collapses focus', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb);

    sub.setFocused(VIRGO);
    sub.setFocused(null);
    expect(sub.focused()).toBeNull();
  });
});

describe('createSelectionSubsystem — render wake', () => {
  it('setSelected wakes the scheduler on actual change', () => {
    const cb = makeCallbacks();
    const requestRender = vi.fn<() => void>();
    const sub = makeSub(cb, { requestRender });

    sub.setSelected(VIRGO);

    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('setSelected does not wake when the selection is unchanged', () => {
    const cb = makeCallbacks();
    const requestRender = vi.fn<() => void>();
    const sub = makeSub(cb, { requestRender });

    sub.setSelected(VIRGO);
    sub.setSelected(VIRGO); // dup — dedupe guard fires

    // Only the first set is an actual change; the second is a no-op.
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('setFocused wakes on change and not on no-op', () => {
    const cb = makeCallbacks();
    const requestRender = vi.fn<() => void>();
    const sub = makeSub(cb, { requestRender });

    sub.setFocused(VIRGO);
    sub.setFocused(VIRGO); // dup — no extra wake

    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('setHovered never wakes the scheduler', () => {
    const cb = makeCallbacks();
    const requestRender = vi.fn<() => void>();
    const sub = makeSub(cb, { requestRender });

    // Several distinct hover transitions — none should wake.
    sub.setHovered(VIRGO);
    sub.setHovered(null);
    sub.setHovered(VIRGO);

    expect(requestRender).not.toHaveBeenCalled();
  });
});

describe('createSelectionSubsystem — lifecycle', () => {
  it('destroy() clears internal state', () => {
    const cb = makeCallbacks();
    const sub = makeSub(cb);

    sub.setHovered(galaxy(Source.SDSS, 1));
    sub.setSelected(VIRGO);
    sub.setFocused(VIRGO);
    expect(sub.hovered()).not.toBeNull();
    expect(sub.selected()).not.toBeNull();
    expect(sub.focused()).not.toBeNull();

    sub.destroy();

    expect(sub.hovered()).toBeNull();
    expect(sub.selected()).toBeNull();
    expect(sub.focused()).toBeNull();
  });
});
