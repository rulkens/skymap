/**
 * Page entry for sfMapPercolation.html — hangs the sweep on globalThis so the
 * Playwright driver can call it, and reports progress into the document so a
 * `--headed` run shows something.
 */
import { runSfMapPercolation } from './sfMapPercolationHarness';
import type { SfMapPercolationReport, SfMapPercolationRequest } from './sfMapPercolationHarness';

declare global {
  var __sfMapPercolation: (request: SfMapPercolationRequest) => Promise<SfMapPercolationReport>;
}

globalThis.__sfMapPercolation = async (request) => {
  const status = document.getElementById('status');
  if (status) status.textContent = `running ${request.cases.length} case(s)…`;
  const report = await runSfMapPercolation(request);
  if (status) status.textContent = `done: ${report.results.length} case(s) on ${report.adapter}`;
  return report;
};
