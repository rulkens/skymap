/**
 * loadLookFonts — the first frame the antique look draws, fetches the fonts boot
 * left out (`onDemand` in the font registry), merges them into
 * `state.gpu.fontAtlases` and rebuilds the label renderers through
 * `buildSwapRenderers`, since their atlas texture is filled at construction.
 * Until they land the look's names fall back to the boot font (`antiqueLabel`).
 * Asked once per engine; a failed fetch warns and the fallback stays.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { FONT_IDS } from '../../../data/fonts';
import { loadFontAtlases } from '../../gpu/labelLayout/loadFontAtlases';
import { antiqueLookOn } from '../../../utils/render/antiqueLookOn';
import { buildSwapRenderers } from '../phases/buildSwapRenderers';
import { lookFontsAsked } from './lookFontsAsked';

export function loadLookFonts(state: EngineState): void {
  const atlases = state.gpu.fontAtlases;
  if (atlases === null || lookFontsAsked.has(state) || !antiqueLookOn(state)) return;
  lookFontsAsked.add(state);
  const missing = FONT_IDS.filter((id) => atlases.metricsByFont[id] === undefined);
  if (missing.length === 0) return;
  loadFontAtlases(missing, atlases)
    .then((loaded) => {
      // Torn down while fetching: nothing left to rebuild.
      if (state.gpu.fontAtlases === null || state.gpu.renderTargets === null) return;
      state.gpu.fontAtlases = loaded;
      buildSwapRenderers(state, state.gpu.renderTargets.specOf('swap').format);
      state.subsystems.scheduler.requestRender();
    })
    .catch((error: unknown) => console.warn('antique look: lettering unavailable', error));
}
