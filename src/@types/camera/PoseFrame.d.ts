import type { BodyId } from '../data/body/BodyId';

/** The frame a stored or authored camera pose is expressed in (ruled, Q10). */
export type PoseFrame = 'absolute' | { readonly body: BodyId };
