/**
 * DustSection — the analytic dust lane's four knobs (`GalaxyParams.dust`):
 * face-on optical depth, the CCM89 extinction law's R_V, and the scale-
 * length/thickness ratios to the stellar disc. Nested under `params.dust`
 * rather than a flat `GalaxyParams` field, so it can't ride the generic
 * `renderGalaxySlider` path (see `GalaxySliderKey`'s exclusion in
 * `ControlsPanel.tsx`) — each slider spreads the current dust object by hand
 * instead. Same fold/pill idiom as
 * `ArmFieldSection`: `ui.openSections.analyticDust` for the fold,
 * `fieldTuning.dustEnabled` for the header pill.
 */
import type { ReactNode } from 'react';
import type { GalaxyDustParams } from '../../../../../src/@types/galaxy/GalaxyDustParams';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../../../../src/data/galaxy/defaultGalaxyDustParams';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { paramsPatched } from '../../state/slices/galaxySlice';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './DustSection.module.css';

function DustSection(): ReactNode {
  const dispatch = useAppDispatch();
  const galaxy = useAppSelector((state) => state.galaxy);
  const fieldTuning = useAppSelector((state) => state.fieldTuning);
  const open = useAppSelector((state) => state.ui.openSections.analyticDust);
  const dust = galaxy.dust ?? DEFAULT_GALAXY_DUST_PARAMS;

  const patchDust = (patch: Partial<GalaxyDustParams>): void => {
    dispatch(paramsPatched({ dust: { ...dust, ...patch } }));
  };

  return (
    <CollapsibleSection
      title="DUST"
      open={open}
      onToggle={() => dispatch(sectionToggled('analyticDust'))}
      headerToggle={fieldTuning.dustEnabled}
      onHeaderToggleChange={(value) => dispatch(fieldTuningPatched({ dustEnabled: value }))}
    >
      <div className={styles.root}>
        <ParamSlider
          label="Face-on optical depth"
          value={dust.tau}
          min={0}
          max={8}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchDust({ tau: v })}
          info="Central face-on tau_V; measured 0.5-1 for spirals (Xilouris et al. 1999, De Geyter et al. 2014). The range above that is deliberate exploration headroom, not a measured span."
        />
        <ParamSlider
          label="Extinction R_V"
          value={dust.rV}
          min={1.5}
          max={8}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patchDust({ rV: v })}
          info="Total-to-selective extinction A_V/E(B-V); sets how much bluer light dims relative to red. Milky Way diffuse ISM 3.1 (greyer above, more reddening below)."
        />
        <ParamSlider
          label="Scale length × disc"
          value={dust.scaleLenRatio}
          min={0.8}
          max={2.5}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchDust({ scaleLenRatio: v })}
        />
        <ParamSlider
          label="Layer thickness × disc"
          value={dust.heightRatio}
          min={0.15}
          max={1.0}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchDust({ heightRatio: v })}
        />
      </div>
    </CollapsibleSection>
  );
}

export default DustSection;
