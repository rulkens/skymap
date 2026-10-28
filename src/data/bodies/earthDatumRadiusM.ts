/**
 * Earth's datum radius, metres: the one number Earth's body row and the craft rows that orbit
 * it (`hitchhikerOrbit`) both read. It lives apart from `SCENE_EARTH` because body rows are
 * leaf data: a row reading `SCENE_EARTH`, a projection of the row fold, is a load-time cycle.
 */
export const EARTH_DATUM_RADIUS_M = 6371000;
