// Shared add-with-dedup logic for the report-email, report-pdf and
// signature-sweep enqueue routes.
//
// Adding a job whose jobId already exists does not create a duplicate — BullMQ
// keeps the FIRST caller's job and data. A job id belonging to an
// already-finished job (completed or failed) is instead a deliberate
// re-send/re-render, so the stale record is removed first and the re-add
// actually runs again.
//
// Critically, `queue.add()` returns a Job object built from the data the
// CALLER passed, NOT the data that ended up persisted — verified directly
// against BullMQ. Under concurrent identical requests every caller would
// therefore see its own payload and each conclude it had won, which is how
// three simultaneous clicks produced three activity rows for one email. So
// the authoritative job is re-read from Redis and returned instead; callers
// compare their own id against `job.data` to find out whether they are the
// one that actually started the work.
async function enqueueWithDedup(queue, name, data, jobId, jobOptions) {
  const job = await queue.add(name, data, { ...jobOptions, jobId });
  const state = await job.getState();

  if (state === 'waiting' || state === 'active' || state === 'delayed') {
    return { job: (await queue.getJob(jobId)) || job, deduped: true };
  }
  if (state === 'completed' || state === 'failed') {
    await job.remove();
    const freshJob = await queue.add(name, data, { ...jobOptions, jobId });
    // Re-read again: another racer may have re-added first, in which case
    // their payload is the persisted one and this caller merely joined it.
    return { job: (await queue.getJob(jobId)) || freshJob, deduped: false };
  }
  return { job: (await queue.getJob(jobId)) || job, deduped: false };
}

module.exports = { enqueueWithDedup };
