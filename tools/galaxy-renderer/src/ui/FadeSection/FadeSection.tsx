/**
 * FadeSection — the app's Milky-Way visibility fade, as a tuning surface.
 *
 * The knobs are ordinary `renderPatched` sliders; the part that earns the
 * component is the readout. The two bands MULTIPLY, so a single alpha cannot
 * say which one closed — and with the anchor set to `sun` (the app's own
 * keying) the approach band never closes at all, because flying to the galactic
 * centre still leaves the camera ~8 kpc from the Sun. Showing both factors and
 * both distances is what makes that visible instead of mysterious.
 */
import type { ReactNode } from 'react';
import type { FadeAnchor } from '../../../@types/engine/FadeAnchor';
import type { MilkyWayFadeReadout } from '../../../@types/engine/MilkyWayFadeReadout';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { renderPatched } from '../../state/slices/renderSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../../../../../src/components/common/CollapsibleSection/CollapsibleSection';
import ParamSlider from '../../../../../src/components/common/ParamSlider/ParamSlider';
import styles from './FadeSection.module.css';

export type FadeSectionProps = {
  /** Last published frame's fade; null until the engine's first report. */
  readonly readout: MilkyWayFadeReadout | null;
};

const ANCHOR_OPTIONS: readonly { readonly value: FadeAnchor; readonly label: string }[] = [
  { value: 'sun', label: 'Sun — what the app does' },
  { value: 'galacticCentre', label: 'Galactic centre — what a fix does' },
  { value: 'none', label: 'None — no fade' },
];

/** Fixed decimals would print either `5000.00` or `0.00`; the range is 5 decades. */
function kpc(value: number): string {
  if (value >= 100) return `${value.toFixed(0)} kpc`;
  if (value >= 1) return `${value.toFixed(2)} kpc`;
  return `${value.toFixed(4)} kpc`;
}

/** Units only — the kpc twin doubled the readout's width and pushed the slider track to a stub. The conversion still rides the slider's `info`. */
function units(value: number): string {
  return `${value.toFixed(2)} u`;
}

function FadeSection({ readout }: FadeSectionProps): ReactNode {
  const dispatch = useAppDispatch();
  const render = useAppSelector((state) => state.render);
  const open = useAppSelector((state) => state.ui.openSections.fade);

  return (
    <CollapsibleSection
      title="MILKY WAY FADE (APP PARITY)"
      open={open}
      onToggle={() => dispatch(sectionToggled('fade'))}
      copyPayload={{
        render: {
          fadeEnabled: render.fadeEnabled,
          fadeAnchor: render.fadeAnchor,
          fadeApproachFullAt: render.fadeApproachFullAt,
          fadeApproachGoneAt: render.fadeApproachGoneAt,
          fadeFullPx: render.fadeFullPx,
          fadeGonePx: render.fadeGonePx,
        },
      }}
    >
      <div className={styles.root}>
        <div className={styles.toggleRow}>
          <label className={styles.toggleLabel}>
            <span>Visibility fade</span>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={render.fadeEnabled}
              onChange={(e) => dispatch(renderPatched({ fadeEnabled: e.target.checked }))}
            />
          </label>
        </div>

        <div className={styles.anchorWrap}>
          <div className={styles.anchorLabel}>Distance measured from</div>
          <select
            className={styles.anchorSelect}
            value={render.fadeAnchor}
            onChange={(e) => dispatch(renderPatched({ fadeAnchor: e.target.value as FadeAnchor }))}
          >
            {ANCHOR_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <ParamSlider
          label="Approach · full at"
          value={render.fadeApproachFullAt}
          min={0}
          max={20}
          step={0.05}
          format={units}
          onChange={(v) => dispatch(renderPatched({ fadeApproachFullAt: v }))}
          path="render.fadeApproachFullAt"
          info="The near-side band: the cloud dissolves as the camera dives in, handing off to the real Gaia star catalog. Sliders are in generator units — one unit is 1.67 kpc — and seed from the app's own 2 kpc / 200 pc edges."
        />
        <ParamSlider
          label="Approach · gone at"
          value={render.fadeApproachGoneAt}
          min={0}
          max={5}
          step={0.01}
          format={units}
          onChange={(v) => dispatch(renderPatched({ fadeApproachGoneAt: v }))}
          path="render.fadeApproachGoneAt"
        />
        <ParamSlider
          label="Apparent size · full at"
          value={render.fadeFullPx}
          min={0}
          max={64}
          step={0.5}
          format={(v) => `${v.toFixed(1)} px`}
          onChange={(v) => dispatch(renderPatched({ fadeFullPx: v }))}
          path="render.fadeFullPx"
          info="The far-side band: below a few pixels of on-screen diameter the sprites collapse into an aliased shimmer, so the cloud fades out. Keyed on apparent size rather than distance so it adapts to fov and window height for free."
        />
        <ParamSlider
          label="Apparent size · gone at"
          value={render.fadeGonePx}
          min={0}
          max={64}
          step={0.5}
          format={(v) => `${v.toFixed(1)} px`}
          onChange={(v) => dispatch(renderPatched({ fadeGonePx: v }))}
          path="render.fadeGonePx"
        />

        <div className={styles.readout}>
          <div className={styles.readoutHeader}>live · both bands multiply</div>
          <div className={styles.row}>
            <span className={styles.slot}>from centre</span>
            <span className={styles.value}>{readout ? kpc(readout.centreDistKpc) : '—'}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.slot}>from anchor</span>
            <span className={styles.value}>{readout ? kpc(readout.anchorDistKpc) : '—'}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.slot}>disc diameter</span>
            <span className={styles.value}>
              {readout ? `${readout.apparentPx.toFixed(1)} px` : '—'}
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.slot}>approach band</span>
            <span className={styles.value}>{readout ? readout.approach.toFixed(3) : '—'}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.slot}>apparent band</span>
            <span className={styles.value}>{readout ? readout.apparent.toFixed(3) : '—'}</span>
          </div>
          <div className={styles.alphaRow}>
            <span className={styles.slot}>alpha</span>
            <span className={styles.value}>{readout ? readout.alpha.toFixed(3) : '—'}</span>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}

export default FadeSection;
