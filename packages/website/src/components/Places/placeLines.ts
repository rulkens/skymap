/* placeLines — the line under each place's name, in PLACES order: its fact's short form, or its own note. Read by the page, so the facts stay out of the island's script. */
import { fact } from '../../data/fact.ts';
import { PLACES } from '../../data/places.ts';

export function placeLines(): string[] {
  return PLACES.map((place) => (place.factId ? fact(place.factId).short : place.note) ?? '');
}
