import type { BodyInfo } from '../../../../@types/engine/BodyInfo';

/** A selected probe sphere: a body's record under the Layer's own tag. */
export type ProbeSphereInfo = Omit<BodyInfo, 'type'> & { readonly type: 'probeSphere' };
