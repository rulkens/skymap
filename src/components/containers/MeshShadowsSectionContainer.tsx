/** MeshShadowsSectionContainer — store boundary for the DebugPanel's "Shadows" board. */

import { memo, useCallback, type ReactNode } from 'react';
import MeshShadowsSection from '../DebugPanel/MeshShadowsSection/MeshShadowsSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setMeshNoShadows, tuneMeshShadows } from '../../state/settings/core/debugSlice';
import type { MeshShadowTuning } from '../../@types/settings/MeshShadowTuning';

function MeshShadowsSectionContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const noShadows = useAppSelector((s) => s.settings.debug.meshNoShadows);
  const tuning = useAppSelector((s) => s.settings.debug.meshShadowTuning);

  const onNoShadowsChange = useCallback(
    (on: boolean) => dispatch(setMeshNoShadows(on)),
    [dispatch],
  );
  const onTune = useCallback(
    (change: Partial<MeshShadowTuning>) => dispatch(tuneMeshShadows(change)),
    [dispatch],
  );

  return (
    <MeshShadowsSection
      noShadows={noShadows}
      tuning={tuning}
      onNoShadowsChange={onNoShadowsChange}
      onTune={onTune}
    />
  );
}

export default memo(MeshShadowsSectionContainer);
