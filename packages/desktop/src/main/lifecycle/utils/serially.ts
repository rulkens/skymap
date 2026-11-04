/** A runner that starts each task only after the previous one settled; a failure reaches only its own caller. */
export function serially(): (task: () => Promise<void>) => Promise<void> {
  let tail: Promise<unknown> = Promise.resolve();
  return (task) => {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };
}
