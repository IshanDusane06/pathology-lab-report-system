const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { isAuthenticated } = require('../middleware/auth');
const hub = require('../events/hub');

// Mints a short-lived, single-purpose token for the SSE stream below.
// EventSource can't set an Authorization header, so the normal bearer-token
// session JWT doesn't work here — same reasoning as the existing
// mintRenderToken for headless Chromium (api/utils/reportPdf.js). The
// `purpose: 'sse'` claim is what isAuthenticated rejects, so this token can
// never be replayed as a full API credential.
router.post('/token', isAuthenticated, (req, res) => {
  const token = jwt.sign({ id: req.user._id, role: req.user.role, purpose: 'sse' }, process.env.JWT_SECRET, {
    expiresIn: '10m',
  });
  res.json({ success: true, data: { token, expiresIn: 600 } });
});

// The SSE stream itself. Auth is manual (not the isAuthenticated
// middleware, which explicitly rejects purpose-bearing tokens) because the
// token travels as a query param, not a header.
router.get('/stream', async (req, res) => {
  let decoded;
  try {
    decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
  } catch (_) {
    return res.status(401).json({ success: false, message: 'Invalid or expired stream token' });
  }
  if (decoded.purpose !== 'sse') {
    return res.status(401).json({ success: false, message: 'Invalid stream token' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    // Disables buffering on nginx-style reverse proxies — without it,
    // events can sit unflushed instead of reaching the client immediately.
    'X-Accel-Buffering': 'no',
  });
  // Without this, nothing reaches the client until the first event is
  // written — the connection just looks hung until then.
  res.flushHeaders();
  res.write(': connected\n\n');

  const deregister = hub.register(decoded.id, res);
  req.on('close', deregister);
});

module.exports = router;
