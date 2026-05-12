import type { PickRenderer } from '../rendering/PickRenderer';
import type { ResolveSelection } from './ResolveSelection';
import type { BuildPointInfo } from './BuildPointInfo';

export type CreateClickResolverInput = {
  pickRenderer: PickRenderer;
  resolveSelection: ResolveSelection;
  buildPointInfo: BuildPointInfo;
};
