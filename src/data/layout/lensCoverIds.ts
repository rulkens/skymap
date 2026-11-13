import type { CoverId } from '../../@types/layout/CoverId';

// The desktop HUD panels report rects for label keep-out only: desktop
// orbiting stays centred on the whole canvas (lens-shift spec §2 non-goals).
export const LENS_COVER_IDS: readonly CoverId[] = ['phoneBottom', 'exhibitNotes', 'exhibitCaption'];
