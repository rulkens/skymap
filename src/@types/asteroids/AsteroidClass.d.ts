/**
 * AsteroidClass — the Settings toggle an asteroid belongs to. `asteroids.astb` stores it as its index in
 * `ASTEROID_CLASSES`, so the order there is part of the file format.
 */
export type AsteroidClass = 'nearEarth' | 'mainBelt' | 'hilda' | 'jupiterTrojan' | 'distant';
