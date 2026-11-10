/**
 * The timeline model (A6): a pure function of the authored draft, the compiler's per-effect spans
 * and the collapsed row ids. Structure, names, values and families come from the draft and
 * ROW_KINDS; every time comes from `compile.spans` by path, never recomputed. A fork is its own
 * row with its child beneath it; a flyPath's waypoints are child rows windowed by its `knotSecs`.
 * A waypoint subject carries `last`, which the registry labels Settle.
 */
import { rowKey } from '../../draft/utils/rowKey';
import { formatQuantity } from '../../utils/format/formatQuantity';
import { rowFace } from './rowFace';
import { groupMembers } from './groupMembers';
import { rowDurationText } from './rowDurationText';
import { rowTailEndSec } from './rowTailEndSec';
import { culpritReasons } from './culpritReasons';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { EffectPath } from '../../../../../src/@types/animation/EffectPath';
import type { EffectSpan } from '../../../../../src/@types/animation/EffectSpan';
import type { RowKind } from '../../@types/rows/RowKind';
import type { RowRef } from '../../@types/rows/RowRef';
import type { RowSubjects } from '../../@types/rows/RowSubjects';
import type { Timeline } from '../../@types/rows/Timeline';
import type { TimelineCompile } from '../../@types/rows/TimelineCompile';
import type { TimelineRow } from '../../@types/rows/TimelineRow';

export function buildTimeline(
  draft: ClipData,
  compile: TimelineCompile | null,
  collapsed: readonly string[],
): Timeline {
  const spans = compile?.spans ?? [];
  const byPath = new Map(spans.map((span) => [span.path.join('.'), span]));
  const spanAt = (path: EffectPath): EffectSpan | undefined => byPath.get(path.join('.'));
  const folded = new Set(collapsed);
  const clipEndSec =
    compile === null
      ? 0
      : compile.ok
        ? compile.durationSec
        : Math.max(0, ...spans.map((span) => span.endSec));
  const culprits = culpritReasons(draft, compile);
  const rows: TimelineRow[] = [];

  const push = <K extends RowKind>(
    ref: RowRef,
    kind: K,
    subject: RowSubjects[K],
    where: Pick<TimelineRow, 'depth' | 'parentId' | 'background' | 'expandable'>,
    times: Pick<TimelineRow, 'startSec' | 'endSec' | 'tailEndSec' | 'duration'>,
    extra: Pick<TimelineRow, 'knotSecs' | 'wave' | 'members'> = {},
  ): string => {
    const id = rowKey(ref);
    const collapsed = where.expandable && folded.has(id);
    const pathKey = ref.kind === 'effect' ? ref.path.join('.') : null;
    rows.push({
      id,
      ref,
      kind,
      ...where,
      collapsed,
      ...rowFace(kind, subject),
      ...times,
      ...extra,
      errors: pathKey === null ? [] : (culprits.get(pathKey) ?? []),
      hidesErrors:
        collapsed &&
        pathKey !== null &&
        [...culprits.keys()].some((culprit) => culprit.startsWith(`${pathKey}.`)),
    });
    return id;
  };

  const visit = (
    effect: Effect,
    path: EffectPath,
    depth: number,
    parentId: string | null,
    background: boolean,
  ): void => {
    const span = spanAt(path);
    const children =
      effect.kind === 'seq' || effect.kind === 'all'
        ? effect.children
        : effect.kind === 'fork'
          ? [effect.child]
          : [];
    const waypoints = effect.kind === 'flyPath' ? effect.waypoints : [];
    const id = push(
      { kind: 'effect', path },
      effect.kind,
      effect,
      { depth, parentId, background, expandable: children.length + waypoints.length > 0 },
      {
        startSec: span?.startSec ?? null,
        endSec: span?.endSec ?? null,
        tailEndSec: rowTailEndSec(effect, path, spanAt, draft, clipEndSec),
        duration: rowDurationText(effect, path, spanAt, draft),
      },
      {
        ...(span?.knotSecs === undefined ? {} : { knotSecs: span.knotSecs }),
        ...(children.length > 0 ? { members: groupMembers(children) } : {}),
        // The evaluator's phase rule: a windowed bob's sine starts at its window, a perpetual one at clip 0.
        ...(effect.kind === 'osc' && span !== undefined
          ? {
              wave: {
                periodSec: effect.period,
                zeroSec: effect.over === undefined ? 0 : span.startSec,
              },
            }
          : {}),
      },
    );
    if (folded.has(id)) return;
    children.forEach((child, index) =>
      visit(child, [...path, index], depth + 1, id, background || effect.kind === 'fork'),
    );
    waypoints.forEach((waypoint, index) => {
      const knots = span?.knotSecs;
      const start = knots === undefined ? null : index === 0 ? span!.startSec : knots[index - 1]!;
      const end = knots?.[index] ?? null;
      push(
        { kind: 'waypoint', path, index },
        'waypoint',
        { ...waypoint, last: index === waypoints.length - 1 },
        { depth: depth + 1, parentId: id, background, expandable: false },
        {
          startSec: start,
          endSec: end,
          tailEndSec: end,
          duration: start === null || end === null ? '–' : formatQuantity(end - start, 's'),
        },
      );
    });
  };

  const resolved = compile !== null;
  push(
    { kind: 'start' },
    'start',
    draft.start,
    { depth: 0, parentId: null, background: false, expandable: false },
    {
      startSec: resolved ? 0 : null,
      endSec: resolved ? 0 : null,
      tailEndSec: resolved ? 0 : null,
      duration: '–',
    },
  );
  draft.timeline.forEach((effect, index) => visit(effect, [index], 0, null, false));

  const cueSecs = resolved
    ? [
        ...new Set([...spans.map((span) => span.startSec), ...(compile.ok ? [clipEndSec] : [])]),
      ].sort((a, b) => a - b)
    : [];
  return {
    rows,
    durationSec: compile?.ok === true ? compile.durationSec : null,
    loop: draft.loop === true,
    error: compile?.ok === false ? compile.error : null,
    cueSecs,
  };
}
