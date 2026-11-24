import { describe, expect, it } from 'vitest';
import { renderRefReport } from '../../../../tools/utils/refactor/renderRefReport';

const REPORT = { target: 'src/shape.ts#Shape.radius', refs: [], fileCount: 0, testCount: 0 };
const UNTRACKED = {
  prop: 'radius',
  findings: [{ file: 'src/use.ts', line: 3, message: 'm' }],
};

describe('renderRefReport', () => {
  it('ends a property report with the untracked quoted mentions', () => {
    const text = renderRefReport(REPORT, false, UNTRACKED);
    expect(text.split('\n').at(-1)).toBe(
      "1 quoted mention(s) of 'radius' are not tracked: src/use.ts:3",
    );
  });

  it('prints no footer when nothing is untracked', () => {
    expect(renderRefReport(REPORT, false, { prop: 'radius', findings: [] })).not.toContain(
      'quoted mention',
    );
    expect(renderRefReport(REPORT, false)).not.toContain('quoted mention');
  });

  it('puts every untracked mention under unreported in --json, and omits the key without any', () => {
    expect(JSON.parse(renderRefReport(REPORT, true, UNTRACKED)).unreported).toEqual(
      UNTRACKED.findings,
    );
    expect(JSON.parse(renderRefReport(REPORT, true))).not.toHaveProperty('unreported');
  });
});
