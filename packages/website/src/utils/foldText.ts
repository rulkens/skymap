/** Text for comparing as a reader types it: lower case and without accents, so "bootes" finds "Boötes". The slashed ø has no accent to drop and is mapped by hand. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ø/g, 'o');
}
