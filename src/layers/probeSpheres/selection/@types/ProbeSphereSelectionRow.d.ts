import type { DriverGeometry } from '../../../../@types/engine/camera/DriverGeometry';
import type { PlacedRow } from '../../../../@types/engine/selection/PlacedRow';
import type { ProbeSphereInfo } from './ProbeSphereInfo';

export type ProbeSphereSelectionRow = ProbeSphereInfo & {
  readonly driver: DriverGeometry;
} & PlacedRow;
