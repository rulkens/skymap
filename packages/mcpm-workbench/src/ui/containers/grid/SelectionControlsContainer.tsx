/**
 * SelectionControlsContainer — store boundary for the Selection box's controls. The catalog
 * points and agent count are read here only for the Auto fit click, so the controls never
 * receive the point arrays.
 */
import { memo, useCallback, type ReactNode } from 'react';
import type { Vec3 } from '../../../../../shared/src/@types/math/Vec3';
import { resolveAutoFitBounds } from '../../../grid/autoFit/resolveAutoFitBounds';
import {
  fitBoxToCatalog,
  setAutoFitPercent,
  setManualCenterMpc,
  setManualSizeMpc,
  setPaddingMpc,
  setVoxelSizeMpc,
} from '../../../state/grid/gridSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import SelectionControls from '../../grid/SelectionControls/SelectionControls';

function SelectionControlsContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const grid = useAppSelector((s) => s.grid);
  const catalogBoundsMpc = useAppSelector((s) => s.catalog.catalogBoundsMpc);
  const catalogPoints = useAppSelector((s) => s.catalog.points);
  const catalogPointCount = useAppSelector((s) => s.catalog.pointCount);
  const agentCount = useAppSelector((s) => s.sim.agentCount);

  const onVoxelSizeChange = useCallback(
    (voxelSizeMpc: number) => dispatch(setVoxelSizeMpc(voxelSizeMpc)),
    [dispatch],
  );
  const onSizeChange = useCallback(
    (sizeMpc: Vec3) => dispatch(setManualSizeMpc(sizeMpc)),
    [dispatch],
  );
  const onCenterChange = useCallback(
    (centerMpc: Vec3) => dispatch(setManualCenterMpc(centerMpc)),
    [dispatch],
  );
  const onAutoFitPercentChange = useCallback(
    (percent: number) => dispatch(setAutoFitPercent(percent)),
    [dispatch],
  );
  const onPaddingChange = useCallback(
    (paddingMpc: number) => dispatch(setPaddingMpc(paddingMpc)),
    [dispatch],
  );
  const onAutoFit = useCallback(() => {
    if (!catalogBoundsMpc) return;
    dispatch(
      fitBoxToCatalog({
        bounds: resolveAutoFitBounds(catalogPoints, catalogBoundsMpc, grid.autoFitPercent),
        lanes: { agentCount, pointCount: catalogPointCount },
      }),
    );
  }, [
    dispatch,
    catalogPoints,
    catalogBoundsMpc,
    grid.autoFitPercent,
    agentCount,
    catalogPointCount,
  ]);

  return (
    <SelectionControls
      grid={grid}
      catalogBoundsMpc={catalogBoundsMpc}
      catalogPointCount={catalogPointCount}
      onVoxelSizeChange={onVoxelSizeChange}
      onSizeChange={onSizeChange}
      onCenterChange={onCenterChange}
      onAutoFitPercentChange={onAutoFitPercentChange}
      onPaddingChange={onPaddingChange}
      onAutoFit={onAutoFit}
    />
  );
}

export default memo(SelectionControlsContainer);
