// Process-local registry of open SSE connections, keyed by user id. One user
// can have several tabs open — all of them receive every event; a tab that
// didn't start the job it names simply ignores it (harmless, since it just
// triggers a redundant data refresh at worst).
const connectionsByUser = new Map();

let nextEventId = 1;
const KEEPALIVE_INTERVAL_MS = 25000;

function register(userId, res) {
  const key = String(userId);
  if (!connectionsByUser.has(key)) {
    connectionsByUser.set(key, new Set());
  }
  connectionsByUser.get(key).add(res);

  const keepalive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (_) {
      // Connection is already gone; req.on('close') below will clean up.
    }
  }, KEEPALIVE_INTERVAL_MS);

  const deregister = () => {
    clearInterval(keepalive);
    const set = connectionsByUser.get(key);
    if (set) {
      set.delete(res);
      if (set.size === 0) connectionsByUser.delete(key);
    }
  };

  return deregister;
}

// Writes one SSE event to every open connection for a user. Never throws —
// a push is a best-effort notification, never a load-bearing side effect
// (the durable record is always written by the job before this is called).
function publishLocal(userId, event) {
  const key = String(userId);
  const set = connectionsByUser.get(key);
  if (!set || set.size === 0) return;

  const id = nextEventId++;
  const payload = `event: job\ndata: ${JSON.stringify(event)}\nid: ${id}\n\n`;

  for (const res of set) {
    try {
      res.write(payload);
    } catch (_) {
      // Dropped below via its own req.on('close') handler.
    }
  }
}

// Used on shutdown so SIGTERM can end open SSE responses before the process
// exits, instead of leaving them to hang.
function closeAll() {
  for (const set of connectionsByUser.values()) {
    for (const res of set) {
      try {
        res.end();
      } catch (_) {
        // Already gone.
      }
    }
  }
  connectionsByUser.clear();
}

function connectionCount() {
  let total = 0;
  for (const set of connectionsByUser.values()) total += set.size;
  return total;
}

module.exports = { register, publishLocal, closeAll, connectionCount };
