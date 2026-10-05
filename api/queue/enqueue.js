// Shared add-with-dedup logic for both report-email and report-pdf: adding
// a job whose jobId already exists just returns the existing BullMQ job
// rather than creating a duplicate or erroring, so a double-click joins the
// in-flight job. A job id belonging to an already-finished job (completed
// or failed) is a deliberate re-send/re-render request, not a double-click
// — remove the stale record first so the re-add actually runs again.
async function enqueueWithDedup(queue, name, data, jobId, jobOptions) {
  const job = await queue.add(name, data, { ...jobOptions, jobId });
  const state = await job.getState();

  if (state === 'waiting' || state === 'active' || state === 'delayed') {
    return { job, deduped: true };
  }
  if (state === 'completed' || state === 'failed') {
    await job.remove();
    const freshJob = await queue.add(name, data, { ...jobOptions, jobId });
    return { job: freshJob, deduped: false };
  }
  return { job, deduped: false };
}

module.exports = { enqueueWithDedup };
