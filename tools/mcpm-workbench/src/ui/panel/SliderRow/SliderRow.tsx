/**
 * SliderRow — the app's `Slider` pill in the workbench row chrome, its ⓘ at
 * the end. Stands in for the shared `ParamSlider`, whose ⓘ sits before the
 * pill, so the app keeps its look; the tip carries the same prose and path.
 */
import type { ReactNode } from 'react';
import type { ParamSliderProps } from '../../../../../../src/components/common/ParamSlider/ParamSlider';
import Slider from '../../../../../../src/components/common/Slider/Slider';
import PanelRow from '../PanelRow/PanelRow';
import styles from './SliderRow.module.css';

export type SliderRowProps = Omit<ParamSliderProps, 'onReseed'>;

function SliderRow({ info, path, ...slider }: SliderRowProps): ReactNode {
  return (
    <PanelRow
      infoName={slider.label}
      info={
        <>
          {info && <span className={styles.tipProse}>{info}</span>}
          <code className={styles.tipPath}>{path}</code>
        </>
      }
    >
      <Slider {...slider} />
    </PanelRow>
  );
}

export default SliderRow;
