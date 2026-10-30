import type { PictureJudgement } from '../@types/PictureJudgement';
import type { PictureReport } from '../@types/PictureReport';

const name = (p: PictureJudgement) => `#${p.index} \`${p.shotId ?? p.file}\``;
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** `report.md`: per width, the flags first (what to fix), then every picture in page order. */
export function pictureReportMarkdown(report: PictureReport): string {
  const lines = [`# Picture report: ${report.page}`, '', `${report.url} · DPR ${report.dpr}`, ''];
  for (const w of report.widths) {
    const flagged = w.pictures.filter((p) => p.flags.length > 0);
    lines.push(
      `## ${w.width} px: ${w.pictures.length} pictures, ${flagged.length} flagged`,
      '',
      `Contact sheet: \`${w.contactSheet}\``,
      '',
      '### Flags',
      '',
      ...(flagged.length === 0 ? ['None.'] : []),
      ...flagged.flatMap((p) => [
        `- ${name(p)} in "${p.section}"`,
        ...p.flags.map((flag) => `  - ${flag}`),
        ...(p.link ? [`  - row link: \`${p.link}\``] : []),
      ]),
      '',
      '### All pictures',
      '',
      '| # | shot | section | box (CSS px) | source / needed px | cropped | luma mean / p5 / p95 | alt |',
      '| - | ---- | ------- | ------------ | ------------------ | ------- | -------------------- | --- |',
      ...w.pictures.map((p) =>
        [
          '',
          p.index,
          `${p.kind === 'video' ? 'video ' : ''}\`${p.shotId ?? p.file}\`${p.transparent ? ' (transparent)' : ''}${p.hiddenNow ? ' (hidden slide)' : ''}`,
          cell(p.section),
          `${p.box.width}x${p.box.height}`,
          `${p.sourceWidth ?? '?'} / ${p.neededWidth ?? '?'}`,
          p.croppedShare === null ? '?' : `${Math.round(p.croppedShare * 100)}%`,
          p.luma ? [p.luma.mean, p.luma.p5, p.luma.p95].map((v) => v.toFixed(2)).join(' / ') : '?',
          p.kind === 'video'
            ? '-'
            : p.alt === null
              ? '(missing)'
              : p.alt === ''
                ? '(decorative)'
                : cell(p.alt),
          '',
        ]
          .join(' | ')
          .trim(),
      ),
      '',
    );
    if (w.notShown.length > 0) lines.push(`Not shown at this width: ${w.notShown.join(', ')}`, '');
  }
  return lines.join('\n');
}
