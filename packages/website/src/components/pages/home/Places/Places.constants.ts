import { PLACES } from '../../../../data/places.ts';
import { loopUrl } from '../../../../utils/loopUrl.ts';
import { TALL_HEIGHT } from './placeLayout.ts';

export const FILMS = PLACES.map((place) => (place.loop ? loopUrl(place.loop) : undefined));
export const IDS = PLACES.map((place) => place.id);
export const tallHeight = TALL_HEIGHT.toFixed(2);
