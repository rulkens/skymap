import type { ProbeSphereInfo } from './ProbeSphereInfo';
import type { ProbeSphereRef } from './ProbeSphereRef';

export type ProbeSphereTarget = ProbeSphereInfo & { readonly ref: ProbeSphereRef };
