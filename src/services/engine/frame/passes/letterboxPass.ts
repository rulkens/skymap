/**
 * letterboxPass — the film look's 2.39:1 bars, the LAST draw on the swap
 * target so they cover every overlay the way a real mask would. Gated off,
 * its step opens no pass at all, so the look off costs nothing.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { filmLetterboxOn } from '../../../../utils/film/filmLetterboxOn';

export const letterboxPass: ContentPass = {
  name: 'letterbox',

  enabled(state) {
    return state.gpu.letterboxRenderer !== null && filmLetterboxOn(state.settings.film);
  },

  draw(pass, _view, ctx, state) {
    state.gpu.letterboxRenderer!.draw(pass, ctx.canvasSize);
  },
};
