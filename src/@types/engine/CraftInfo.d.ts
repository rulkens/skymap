import type { BodyInfo } from './BodyInfo';

/**
 * CraftInfo — the display-ready projection of a selected/hovered craft: a body's
 * record under the missions Layer's own `craft` tag, so the card, the halo and
 * the framing read it exactly as they read a body.
 */
export type CraftInfo = Omit<BodyInfo, 'type'> & { readonly type: 'craft' };
