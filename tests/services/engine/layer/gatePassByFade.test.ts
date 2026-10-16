import { describe, expect, it, vi } from 'vitest';

import { APP_VISIBILITY } from '../../../../src/compositions/appVisibility';
import { GALAXY_CATALOG_IDS } from '../../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import { gatePassByFade } from '../../../../src/services/engine/layer/gatePassByFade';
import type { ContentPass } from '../../../../src/@types/engine/frame/ContentPass';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeSurvey(live: readonly string[]) {
  const fades = createFadeRegistry({ requestRender: () => {} });
  for (const item of GALAXY_CATALOG_IDS) {
    fades.register({ address: 'survey', item }, live.includes(item) ? 1 : 0);
  }
  const state = {
    subsystems: { fades, clipPlayer: { clipOpacityOf: () => 1 } },
    visibilityEntries: APP_VISIBILITY,
  } as unknown as EngineState;
  const enabled = vi.fn(() => true);
  const pickEnabled = vi.fn(() => true);
  const pass: ContentPass<'survey'> = {
    name: 'p',
    fade: 'survey',
    enabled,
    pickEnabled,
    draw: () => {},
  };
  return { gated: gatePassByFade(pass, state), enabled, pickEnabled };
}

const S = {} as PassState;
const VIEW = {} as SlabView;
const CTX = { snapshot: { nowMs: 0, focusBlend: 0 } } as unknown as FrameView;

describe('gatePassByFade', () => {
  it('a per-item pass with one non-zero item is called with the record', () => {
    const { gated, enabled } = makeSurvey(['sdss']);
    expect(gated.enabled(S, CTX, VIEW)).toBe(true);
    expect(enabled).toHaveBeenCalledWith(
      S,
      CTX,
      VIEW,
      expect.objectContaining({ sdss: 1, glade: 0 }),
    );
  });

  it('all items at 0 → enabled and pickEnabled are false and the inner is never called', () => {
    const { gated, enabled, pickEnabled } = makeSurvey([]);
    expect(gated.enabled(S, CTX, VIEW)).toBe(false);
    expect(gated.pickEnabled!(S, CTX, VIEW)).toBe(false);
    expect(enabled).not.toHaveBeenCalled();
    expect(pickEnabled).not.toHaveBeenCalled();
  });
});
