/**
 * MeshShadowsSection — the DebugPanel's "Shadows" board: the mesh bodies' sun shadow switch and
 * its live knobs, read by the mesh fragment and the surface tiles alike. Props only; the
 * container owns the store reach.
 */

import { memo, type ReactNode } from 'react';
import DebugSection from '../DebugSection';
import DebugOverlayToggles from '../DebugOverlayToggles';
import DebugSegmentedRow from '../DebugSegmentedRow';
import DebugSlider from '../DebugSlider';
import { MESH_SHADOW_FILTER_SIDES, MESH_SHADOW_MAP_SIZES } from '../../../data/mesh/meshShadowMap';
import type { MeshShadowTuning } from '../../../@types/settings/MeshShadowTuning';

const TOGGLE_ROWS = [
  {
    key: 'noShadows',
    label: 'No mesh shadows',
    info: 'Rovers, craft and moons draw without their sun shadows, on themselves and on the ground.',
  },
] as const;

const MAP_SIZE_OPTIONS = MESH_SHADOW_MAP_SIZES.map((px) => ({ value: px, label: String(px) }));

const FILTER_SAMPLE_OPTIONS = MESH_SHADOW_FILTER_SIDES.map((side) => ({
  value: side,
  label: String(side * side),
}));

export type MeshShadowsSectionProps = {
  readonly noShadows: boolean;
  readonly tuning: MeshShadowTuning;
  readonly onNoShadowsChange: (noShadows: boolean) => void;
  readonly onTune: (tuning: Partial<MeshShadowTuning>) => void;
};

function MeshShadowsSection({
  noShadows,
  tuning,
  onNoShadowsChange,
  onTune,
}: MeshShadowsSectionProps): ReactNode {
  return (
    <DebugSection title="Shadows">
      <DebugOverlayToggles
        rows={TOGGLE_ROWS}
        overlays={{ noShadows }}
        onToggle={(_key, on) => onNoShadowsChange(on)}
      />
      <DebugSegmentedRow
        label="Map size"
        value={tuning.mapPx}
        options={MAP_SIZE_OPTIONS}
        onChange={(mapPx) => onTune({ mapPx })}
        info="Texels per side of each body's shadow layer. Sharper edges, more memory: 4, 16 or 64 MB."
      />
      <DebugSlider
        label="Depth bias"
        value={tuning.depthBiasTexels}
        min={0}
        max={4}
        step={0.05}
        readout={tuning.depthBiasTexels.toFixed(2)}
        onChange={(depthBiasTexels) => onTune({ depthBiasTexels })}
        info="Moves each receiver toward the sun before the compare, in texels. Clears speckled self-shadow; too much detaches shadows from their casters."
      />
      <DebugSlider
        label="Normal offset"
        value={tuning.normalOffsetTexels}
        min={0}
        max={6}
        step={0.1}
        readout={tuning.normalOffsetTexels.toFixed(1)}
        onChange={(normalOffsetTexels) => onTune({ normalOffsetTexels })}
        info="Steps a mesh off its own surface before the compare, in texels. Mesh only: the ground does not use it."
      />
      <DebugSegmentedRow
        label="Samples"
        value={tuning.filterSide}
        options={FILTER_SAMPLE_OPTIONS}
        onChange={(filterSide) => onTune({ filterSide })}
        info="The softening filter's sample count per pixel, in a square grid. More gives smoother shadow edges at more cost."
      />
      <DebugSlider
        label="Filter radius"
        value={tuning.filterRadiusTexels}
        min={0}
        max={4}
        step={0.1}
        readout={tuning.filterRadiusTexels.toFixed(1)}
        onChange={(filterRadiusTexels) => onTune({ filterRadiusTexels })}
        info="The sample grid reaches this far either side, in texels. Wider is softer."
      />
    </DebugSection>
  );
}

export default memo(MeshShadowsSection);
