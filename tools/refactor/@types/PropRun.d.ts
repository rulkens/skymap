import type { FoundPropRefs } from '../../@types/refactor/FoundPropRefs';
import type { PropAddress } from '../../@types/refactor/PropAddress';
import type { RunInput } from './RunInput';

export type PropRun = RunInput<PropAddress, FoundPropRefs>;
