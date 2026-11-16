/**
 * letterboxPass — the film look's letterbox bars, the LAST draw on the swap
 * target so they cover every overlay the way a real mask would. Gated off,
 * its step opens no pass at all, so the look off costs nothing.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';

export const letterboxPass: ContentPass = {
  name: 'letterbox',

  enabled(state) {
    const { enabled, letterbox } = state.settings.film;
    return state.gpu.letterboxRenderer !== null && enabled && letterbox;
  },

  draw(pass, _view, ctx, state) {
    state.gpu.letterboxRenderer!.draw(pass, ctx.canvasSize, state.settings.film.letterboxAspect);
  },
};
