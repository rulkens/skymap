import type { AttributionUse } from '../../../tools/@types/io/AttributionUse';
import { ATTRIBUTION_USES } from '../../../tools/utils/io/attributionUses';

/** One spelling for each licence the record or a holder writes in more than one way. */
const sameNames = (licence: string) =>
  licence
    .replace(/CC-BY/g, 'CC BY')
    .replace(/Attribution-NonCommercial-ShareAlike (\d\.\d) International/g, 'CC BY-NC-SA $1')
    .replace(/Attribution (\d\.\d) International/g, 'CC BY $1');

const NO_LICENCE =
  /no licence stated|not stated|state none|states no|none stated|no separate licence|no licence of its own|no copyright section|authors: none/i;

/** The licences a line names, and the three things it can say in place of one. */
export const licenceNames = (licence: string): string[] => [
  ...(sameNames(licence).match(/CC BY(?:-[A-Z]{2})*(?: \d\.\d)?(?: IGO)?|CC0/g) ?? []),
  ...(/public domain/i.test(licence) ? ['public domain'] : []),
  ...(NO_LICENCE.test(licence) ? ['no licence'] : []),
  ...(/as NASA states|NASA's media guidelines/.test(licence) ? ['NASA’s guidelines'] : []),
];

/** Words a hand-written licence line must hold beside a `Use` term that limits use, so it cannot read freer than the term. */
const SAYS: Readonly<Partial<Record<AttributionUse, RegExp>>> = {
  'Non-commercial only': /non-commercial/i,
  'No licence stated': /no licence|no terms|states no|no constraint/i,
  'Conditions apply': /NASA|conditions/i,
  'Ask the holder': /permission|copyright/i,
  'Per item': /\bper (map|image|item)|each/i,
  'No derivatives': /no deriv/i,
  'Copyleft code': /GPL|copyleft/i,
};

/** The limiting `Use` terms of `uses` that the line `licence` does not say. */
export const unsaidLimits = (licence: string, uses: readonly AttributionUse[]): AttributionUse[] =>
  uses.filter((term) => ATTRIBUTION_USES[term] === 'restricted' && !SAYS[term]!.test(licence));
