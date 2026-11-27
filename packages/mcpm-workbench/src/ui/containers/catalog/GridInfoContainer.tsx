/** GridInfoContainer — store boundary for the load dialog's Selection preview: the box as set and the agent count. */
import { memo, type ReactNode } from 'react';
import { useAppSelector } from '../../../store/hooks';
import GridInfo, { type GridInfoProps } from '../../catalog/LoadCatalogDialog/GridInfo/GridInfo';

export type GridInfoContainerProps = Omit<GridInfoProps, 'grid' | 'agentCount'>;

function GridInfoContainer(props: GridInfoContainerProps): ReactNode {
  const grid = useAppSelector((s) => s.grid);
  const agentCount = useAppSelector((s) => s.sim.agentCount);
  return <GridInfo {...props} grid={grid} agentCount={agentCount} />;
}

export default memo(GridInfoContainer);
