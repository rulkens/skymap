/**
 * ANTIQUE_TITLE_CARTOUCHES — the frame each plate's title is set in, by kind of
 * plate, so no two kinds share a cartouche: a chart of the heavens or the
 * universe takes Ortelius' strapwork (his world maps'), a map of the Earth de
 * Wit's scrollwork (his polar map's), a globe of its own Goos' framed tablet.
 */

import type { AntiqueCartoucheDesign } from '../../@types/rendering/AntiqueCartoucheDesign';
import type { AntiqueTitleKey } from '../../@types/rendering/AntiqueTitleKey';

export const ANTIQUE_TITLE_CARTOUCHES: Readonly<Record<AntiqueTitleKey, AntiqueCartoucheDesign>> = {
  coelum: 'strapwork',
  universe: 'strapwork',
  orbis: 'scrollwork',
  europa: 'scrollwork',
  asia: 'scrollwork',
  africa: 'scrollwork',
  americaSeptentrionalis: 'scrollwork',
  americaMeridionalis: 'scrollwork',
  belgium: 'scrollwork',
  hollandia: 'scrollwork',
  luna: 'tablet',
  mars: 'tablet',
  iupiter: 'tablet',
  saturnus: 'tablet',
};
