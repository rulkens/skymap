/**
 * Page entry for ismMapPercolation.html — hangs the sweep on globalThis so the
 * Playwright driver can call it, and reports progress into the document so a
 * `--headed` run shows something.
 */
import { runIsmMapPercolation } from './ismMapPercolationHarness';
import type { IsmMapPercolationReport, IsmMapPercolationRequest } from './ismMapPercolationHarness';

declare global {
  var __ismMapPercolation: (request: IsmMapPercolationRequest) => Promise<IsmMapPercolationReport>;
}

globalThis.__ismMapPercolation = async (request) => {
  const status = document.getElementById('status');
  if (status) status.textContent = `running ${request.cases.length} case(s)…`;
  const report = await runIsmMapPercolation(request);
  if (status) status.textContent = `done: ${report.results.length} case(s) on ${report.adapter}`;
  return report;
};
