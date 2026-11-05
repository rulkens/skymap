import type { AttributionUse } from '../../@types/io/AttributionUse';

/**
 * Every `Use` term of `ATTRIBUTIONS.md`, in the order the file defines them,
 * with whether it lets a thing be used commercially without asking anyone.
 * A `Record` so that a term added to the type and not here fails to compile.
 */
export const ATTRIBUTION_USES: Readonly<Record<AttributionUse, 'free' | 'restricted'>> = {
  'Free, no credit asked': 'free',
  'Free with credit': 'free',
  'Share-alike': 'free',
  'Copyleft code': 'restricted',
  'Conditions apply': 'restricted',
  'Non-commercial only': 'restricted',
  'No derivatives': 'restricted',
  'Ask the holder': 'restricted',
  'No licence stated': 'restricted',
  'Per item': 'restricted',
  'Reference only': 'free',
  'Ours (MIT)': 'free',
};
