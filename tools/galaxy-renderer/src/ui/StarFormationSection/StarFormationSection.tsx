/**
 * StarFormationSection — the seeded SF-event model's own knobs
 * (`GalaxyParams.starFormation`, built by `src/services/engine/galaxyGenerator/v2/sfEventCatalog.ts`):
 * the event rate and the relic-bubble radius scaler. A different model from
 * the SSPSF automaton `SfMapSection` drives — the two share no state, so they
 * get separate sections rather than one "star formation" drawer. Nested
 * object, so it needs its own patch-spreading handler, same idiom as
 * `DustSection`. No header pill: `sfActivity` 0 already disables the catalog.
 */
import type { ReactNode } from 'react';
import type { GalaxyStarFormationParams } from '../../../../../src/@types/galaxy/GalaxyStarFormationParams';
import { DEFAULT_GALAXY_STAR_FORMATION_PARAMS } from '../../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyStarFormationParams';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { paramsPatched } from '../../state/slices/galaxySlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './StarFormationSection.module.css';

function StarFormationSection(): ReactNode {
  const dispatch = useAppDispatch();
  const galaxy = useAppSelector((state) => state.galaxy);
  const open = useAppSelector((state) => state.ui.openSections.starFormation);
  const starFormation = galaxy.starFormation ?? DEFAULT_GALAXY_STAR_FORMATION_PARAMS;

  const patchStarFormation = (patch: Partial<GalaxyStarFormationParams>): void => {
    dispatch(paramsPatched({ starFormation: { ...starFormation, ...patch } }));
  };

  return (
    <CollapsibleSection
      title="STAR FORMATION"
      open={open}
      onToggle={() => dispatch(sectionToggled('starFormation'))}
      copyPayload={{ galaxy: { starFormation } }}
    >
      <div className={styles.root}>
        <ParamSlider
          label="SF activity"
          value={starFormation.sfActivity}
          min={0}
          max={2.5}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchStarFormation({ sfActivity: v })}
          path="galaxy.starFormation.sfActivity"
          info="Star-formation event-catalog rate; drives the bubble catalog now, HII knots later."
        />
        <ParamSlider
          label="Bubble size x"
          value={starFormation.bubbleScale}
          min={0.3}
          max={2.5}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchStarFormation({ bubbleScale: v })}
          path="galaxy.starFormation.bubbleScale"
          info="× measured default. Radii 6-552 pc in NGC 628, size power law slope frozen (Watkins et al. 2023)."
        />
      </div>
    </CollapsibleSection>
  );
}

export default StarFormationSection;
