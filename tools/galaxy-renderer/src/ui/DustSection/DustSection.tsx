/**
 * DustSection — the dust disc's own knobs (`GalaxyParams.dust`): face-on
 * optical depth, the CCM89 extinction law's R_V, and the scale-length and
 * thickness ratios to the stellar disc. Nested under `params.dust`
 * rather than a flat `GalaxyParams` field, so it can't ride the generic
 * `renderGalaxySlider` path (see `GalaxySliderKey`'s exclusion in
 * `ControlsPanel.tsx`) — each slider spreads the current dust object by hand
 * instead. Same fold/pill idiom as
 * `ArmFieldSection`: `ui.openSections.analyticDust` for the fold,
 * `fieldTuning.dust.enabled` for the header pill.
 */
import type { ReactNode } from 'react';
import type { GalaxyDustParams } from '../../../../../src/@types/galaxy/GalaxyDustParams';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyDustParams';
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
  const dustTuning = useAppSelector((state) => state.fieldTuning.dust);
  const open = useAppSelector((state) => state.ui.openSections.analyticDust);
  const dust = galaxy.dust ?? DEFAULT_GALAXY_DUST_PARAMS;

  const patchDust = (patch: Partial<GalaxyDustParams>): void => {
    dispatch(paramsPatched({ dust: { ...dust, ...patch } }));
  };

  // `cloud` is DUST CLOUD's own section and copies from there.
  const { cloud: _cloud, ...smoothDust } = dust;

  return (
    <CollapsibleSection
      title="DUST"
      open={open}
      onToggle={() => dispatch(sectionToggled('analyticDust'))}
      headerToggle={dustTuning.enabled}
      onHeaderToggleChange={(value) =>
        dispatch(fieldTuningPatched({ dust: { ...dustTuning, enabled: value } }))
      }
      copyPayload={{
        galaxy: { dust: smoothDust },
        fieldTuning: { dust: { enabled: dustTuning.enabled } },
      }}
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
          path="galaxy.dust.tau"
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
          path="galaxy.dust.rV"
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
          path="galaxy.dust.scaleLenRatio"
          info="Dust/stellar radial scale-length ratio — the dust disc is more extended than the light it reddens. Measured 1.4-1.75 (Xilouris et al. 1999). With ISM-map seeding on, this sets the total column and how far the dust slices reach, not where the clouds land."
        />
        <ParamSlider
          label="Layer thickness × disc"
          value={dust.heightRatio}
          min={0.15}
          max={1.0}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchDust({ heightRatio: v })}
          path="galaxy.dust.heightRatio"
          info="Dust/stellar vertical sigma ratio — the dust layer is thinner than the stellar disc it sits in. Measured 0.25-0.75 across spirals; the Milky Way's own is ~0.35."
        />
      </div>
    </CollapsibleSection>
  );
}

export default DustSection;
