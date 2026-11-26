import type { StructureId } from '../../../../@types/data/structure/StructureId';
import type { LabelStyleId } from '../../../../@types/rendering/LabelStyleId';

/** Each structure category's row in `LABEL_STYLES`. */
export const STRUCTURE_LABEL_STYLES: Readonly<Record<StructureId, LabelStyleId>> = {
  'galaxy-cluster': 'galaxyCluster',
  supercluster: 'supercluster',
  void: 'void',
  'galaxy-group': 'galaxyGroup',
  'open-cluster': 'openCluster',
  'globular-cluster': 'globularCluster',
  nebula: 'nebula',
  'gc-cluster': 'gcCluster',
};
