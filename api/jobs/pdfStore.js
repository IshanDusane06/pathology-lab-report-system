const { getCommandClient } = require('../queue/connection');

function keyFor(jobId) {
  return `pdfresult:${jobId}`;
}

function ttlSeconds() {
  return Number(process.env.PDF_RESULT_TTL_SECONDS) || 600;
}

// A rendered PDF is a disposable artifact with a short lifetime — it lives
// in Redis with a TTL rather than Mongo/GridFS/disk, which would all need
// their own cleanup sweeper for something that expires in minutes anyway.
async function put(jobId, buffer) {
  const client = getCommandClient();
  await client.set(keyFor(jobId), buffer, 'EX', ttlSeconds());
}

// Buffer-safe read. ioredis's plain `get` decodes the reply as utf8 and
// will silently corrupt binary PDF bytes — `getBuffer` is required here.
async function getBuffer(jobId) {
  const client = getCommandClient();
  return client.getBuffer(keyFor(jobId));
}

async function del(jobId) {
  const client = getCommandClient();
  await client.del(keyFor(jobId));
}

module.exports = { put, getBuffer, del, ttlSeconds };
