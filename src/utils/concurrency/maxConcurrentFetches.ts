/**
 * Maximum number of tasks `PriorityQueue` runs at once.
 *
 * Browsers cap HTTP/1.1 at ~6 connections per origin; 4 leaves room for
 * other resources (the .bin downloads, fonts, etc.) without bottlenecking
 * them when the user zooms in suddenly and we want a flurry of thumbnails.
 */
export const MAX_CONCURRENT_FETCHES = 4;
