import type { PickRenderer } from '../rendering/PickRenderer';
import type { ResolveSelection } from './ResolveSelection';
import type { BuildGalaxyInfo } from './BuildGalaxyInfo';

export type CreateClickResolverInput = {
  pickRenderer: PickRenderer;
  resolveSelection: ResolveSelection;
  buildGalaxyInfo: BuildGalaxyInfo;
};
