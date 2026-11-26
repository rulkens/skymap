import { describe, expect, it } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import { createLabelFrame } from '../../../../src/services/engine/labels/createLabelFrame';
import { labelEnvelope } from '../../../../src/services/engine/labels/labelEnvelope';
import { LABEL_STAGES } from '../../../../src/data/labels/labelStages';
import { LABEL_DIRECTORS } from '../../../../src/data/labels/labelDirectors';
import { LABEL_FADE_MS } from '../../../../src/data/labels/labelFadeMs';
import { LABEL_RECORD, LABEL_RECORD_WORDS } from '../../../../src/data/labels/labelRecordLayout';
import { createLabelRecords } from '../../../../src/utils/labels/createLabelRecords';
import { encodeLabelSource } from '../../../../src/utils/labels/encodeLabelSource';
import { labelSource } from '../../../../src/utils/labels/labelSource';
import { COSMO, NEAR0 } from '../../../../src/services/engine/frame/slabs';
import { LETTER_A_METRICS } from '../../../helpers/labels/letterAMetrics';
import { stageInputs, stageRecords } from '../../../helpers/labels/labelStageFixture';

const alphaOf = (f32: Float32Array, i: number) => f32[i * LABEL_RECORD_WORDS + LABEL_RECORD.alpha]!;

describe('labelEnvelope', () => {
  it('fade state survives a re-encode that reorders records', () => {
    const cosmo = LABEL_DIRECTORS.find((row) => row.slab === COSMO)!;
    let order = ['a', 'b'];
    const source = labelSource({
      slab: COSMO,
      toggle: 'body',
      style: 'constellation',
      changes: () => order,
      items: () => order,
      describe: (name: string) => ({
        text: 'A',
        position: [name === 'a' ? -0.3 : 0.3, 0, -1],
        pick: { code: 1, index: name === 'a' ? 0 : 1 },
        fadeKey: name,
      }),
    });
    const records = createLabelRecords(4, 16, LETTER_A_METRICS);
    const frame = createLabelFrame(records.capacity);
    const step = (nowMs: number) => {
      records.count = encodeLabelSource(source, {} as EngineState, records, 0, 0);
      const inputs = stageInputs({ director: cosmo, nowMs, toggleFades: [{ a: 0.5, b: 1 }] });
      for (const stage of LABEL_STAGES) stage(records, frame, inputs);
    };
    step(0);
    step(1000);
    expect([alphaOf(records.f32, 0), alphaOf(records.f32, 1)]).toEqual([0.5, 1]);

    order = ['b', 'a'];
    step(1016);
    // A record new to the envelope would start its ramp at 0.
    expect([alphaOf(records.f32, 0), alphaOf(records.f32, 1)]).toEqual([1, 0.5]);
  });

  it('eases a declutter cull out instead of popping it', () => {
    const { records, frame, at } = culled();
    at(0, 1);
    expect(at(1000, 1)).toBe(1);
    expect(frame.ramping).toBe(false);
    at(1050, 0);
    const easing = at(1050 + LABEL_FADE_MS / 2, 0);
    expect(easing).toBeGreaterThan(0);
    expect(easing).toBeLessThan(1);
    expect(frame.ramping).toBe(true);
    expect(at(3000, 0)).toBe(0);
    expect(frame.ramping).toBe(false);
    expect(alphaOf(records.f32, 0)).toBe(0);
  });

  it('a fade ends exactly at its target and stops asking for frames', () => {
    const { frame, at } = culled();
    at(0, 0);
    expect(at(LABEL_FADE_MS / 2, 1)).toBe(0);
    expect(frame.ramping).toBe(true);
    expect(at(LABEL_FADE_MS / 2 + LABEL_FADE_MS, 1)).toBe(1);
    expect(frame.ramping).toBe(false);
  });
});

function culled() {
  const director = LABEL_DIRECTORS.find((row) => row.slab === NEAR0)!;
  const records = stageRecords([{ text: 'A', position: [0, 0, -1] }], 'constellation');
  const frame = createLabelFrame(records.capacity);
  const at = (nowMs: number, survivor: 0 | 1) => {
    frame.target[0] = 1;
    frame.survivor[0] = survivor;
    labelEnvelope(records, frame, stageInputs({ director, nowMs }));
    return alphaOf(records.f32, 0);
  };
  return { records, frame, at };
}
