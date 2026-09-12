/** The real PROJ `cct` subprocess behind `topocentricPositionsM`'s `CctRunner`. */
import { spawn } from 'node:child_process';

export function spawnCct(pipeline: string, inputLines: readonly string[]): Promise<string[]> {
  return new Promise((resolvePromise, reject) => {
    // The pipeline is `cct`'s argv, one `+key=value` token per argument.
    const child = spawn('cct', pipeline.split(' '), { stdio: ['pipe', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`spawnCct: \`cct\` exited with code ${code}`));
        return;
      }
      resolvePromise(stdout.split('\n').filter((line) => line.trim() !== ''));
    });
    // An EPIPE from a `cct` that died before draining lands on the stream, not
    // on the child — uncaught unless it is routed to the same rejection.
    child.stdin.on('error', reject);
    child.stdin.end(`${inputLines.join('\n')}\n`);
  });
}
