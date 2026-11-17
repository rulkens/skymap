import type { AsteroidInfo } from './AsteroidInfo';
import type { AsteroidRef } from './AsteroidRef';

export type AsteroidTarget = AsteroidInfo & { readonly ref: AsteroidRef };
