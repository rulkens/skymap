/**
 * AssembledOrbitCamera — an `OrbitCamera` with `poseBasis`/`upBasis` narrowed
 * from `OrbitCameraInit`'s optional pair to required: `assembleOrbitCamera`
 * always sets both from its own required parameters, so a caller that only
 * ever holds an assembled camera (the frame path) gets that guarantee back
 * from the type checker instead of asserting it with `!` at each read.
 */

import type { Mat3 } from '../math/Mat3';
import type { OrbitCamera } from './OrbitCamera';

export type AssembledOrbitCamera = OrbitCamera & { poseBasis: Mat3; upBasis: Mat3 };
