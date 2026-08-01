/**
 * DustNetworkSection — the PHANGS-style filament/bubble network layered on
 * the flat dust lane (`GalaxyParams.dust.network`, design:
 * `docs/grill-sessions/analytic-dust-lane-2026-08-01.md` N4). Same nested-
 * patch idiom as `DustSection`: `params.dust.network` needs its own
 * spreading handler rather than the generic single-value slider path.
 * No header pill — the network rides DUST's `dustEnabled` master; there's
 * no independent on/off for it.
 */
import type { ReactNode } from 'react';
import type { GalaxyDustNetworkParams } from '../../../../../src/@types/galaxy/GalaxyDustNetworkParams';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../../../../src/data/galaxy/defaultGalaxyDustParams';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { paramsPatched } from '../../state/slices/galaxySlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './DustNetworkSection.module.css';

function DustNetworkSection(): ReactNode {
  const dispatch = useAppDispatch();
  const galaxy = useAppSelector((state) => state.galaxy);
  const open = useAppSelector((state) => state.ui.openSections.dustNetwork);
  const dust = galaxy.dust ?? DEFAULT_GALAXY_DUST_PARAMS;
  const network = dust.network;

  const patchNetwork = (patch: Partial<GalaxyDustNetworkParams>): void => {
    dispatch(paramsPatched({ dust: { ...dust, network: { ...network, ...patch } } }));
  };

  return (
    <CollapsibleSection
      title="DUST NETWORK"
      open={open}
      onToggle={() => dispatch(sectionToggled('dustNetwork'))}
    >
      <div className={styles.root}>
        <ParamSlider
          label="Lane contrast"
          value={network.armContrast}
          min={1}
          max={6}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patchNetwork({ armContrast: v })}
          info="Molecular arm/interarm contrast; measured ~2-5, deliberately sharper than the stellar K≈1.3."
        />
        <ParamSlider
          label="SF activity"
          value={network.sfActivity}
          min={0}
          max={2.5}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchNetwork({ sfActivity: v })}
          info="Star-formation event-catalog rate; drives the bubble catalog now, HII knots later."
        />
        <ParamSlider
          label="Texture"
          value={network.texture}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchNetwork({ texture: v })}
          info="Zero-mean small-scale structure amplitude; 0 = smooth lane, 1 = full PHANGS crinkle."
        />
        <ParamSlider
          label="Spur strength"
          value={network.spurStrength}
          min={0}
          max={1.5}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchNetwork({ spurStrength: v })}
          info="Spur/feather prominence. Spurs gate on lane strength — present in 83% of galaxies with a well-defined primary dust lane vs 20% overall (La Vigne, Vogel & Ostriker 2006)."
        />
        <ParamSlider
          label="Lane width x"
          value={network.laneWidth}
          min={0.3}
          max={3}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchNetwork({ laneWidth: v })}
          info="× measured default. No primary-verified width anchor exists — the default is an eyeball-vs-M74 call, flagged honest."
        />
        <ParamSlider
          label="Lane offset x"
          value={network.laneOffset}
          min={0}
          max={2.5}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchNetwork({ laneOffset: v })}
          info="× measured default. Density-wave shock displacement from the stellar ridge (~150-315 pc, secondary source)."
        />
        <ParamSlider
          label="Spur spacing x"
          value={network.spurSpacing}
          min={0.5}
          max={2.5}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchNetwork({ spurSpacing: v })}
          info="× measured default. Quasi-regular spacing of 300-800 pc (secondary; theory predicts 0.5-1 kpc)."
        />
        <ParamSlider
          label="Spur length x"
          value={network.spurLength}
          min={0.3}
          max={2.5}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchNetwork({ spurLength: v })}
          info="× measured default. Spur lengths run 1-5 kpc (secondary)."
        />
        <ParamSlider
          label="Bubble size x"
          value={network.bubbleScale}
          min={0.3}
          max={2.5}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchNetwork({ bubbleScale: v })}
          info="× measured default. Radii 6-552 pc in NGC 628, size power law slope frozen (Watkins et al. 2023)."
        />
        <ParamSlider
          label="Bubble rims"
          value={network.bubbleRimStrength}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchNetwork({ bubbleRimStrength: v })}
          info="0 = pure holes, 1 = strong swept rims."
        />
        <ParamSlider
          label="Bead share"
          value={network.beadShare}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchNetwork({ beadShare: v })}
          info="How much of the texture amplitude is discrete GMC beads (diameters ~40-100 pc) vs continuous crinkle."
        />
      </div>
    </CollapsibleSection>
  );
}

export default DustNetworkSection;
