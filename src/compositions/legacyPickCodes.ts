/**
 * LEGACY_PICK_CODES — layer name → pick-source id → today's `Source` value, seeding the
 * allocator so Layers can move onto `pickCode` before codes go dense. Deleted with the
 * dense-code step; no new entries after that.
 */

import { Source } from '../data/source';

export const LEGACY_PICK_CODES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  galaxyCatalog: {
    sdss: Source.SDSS,
    '2mrs': Source.TwoMRS,
    glade: Source.Glade,
    famousGalaxy: Source.FamousGalaxy,
    milliquas: Source.Milliquas,
    desiDeep: Source.DesiDeep,
    desiWedge: Source.DesiWedge,
    desiSgw: Source.DesiSgw,
  },
  starCatalog: {
    gaiaStars: Source.GaiaStars,
    famousStar: Source.FamousStar,
    sun: Source.Sun,
    sStar: Source.SStar,
  },
  body: {
    planet: Source.Planet,
    earth: Source.Earth,
    'small-body': Source.SmallBody,
  },
  missions: {
    craft: Source.Craft,
  },
};
