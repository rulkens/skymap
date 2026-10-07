/**
 * The closed vocabulary of an entry's `Use` bullet in `ATTRIBUTIONS.md`, where
 * each term is defined in one line. `attributionUses.ts` says which are free.
 */
export type AttributionUse =
  | 'Free, no credit asked'
  | 'Free with credit'
  | 'Share-alike'
  | 'Copyleft code'
  | 'Conditions apply'
  | 'Non-commercial only'
  | 'No derivatives'
  | 'Ask the holder'
  | 'No licence stated'
  | 'Per item'
  | 'Reference only'
  | 'Ours (MIT)';
