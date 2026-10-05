const jwt = require('jsonwebtoken');

// Rendering the *real* report page rather than re-implementing its layout
// server-side. ReportReadOnlyView.tsx is ~400 lines of real logic (section
// grouping, gender/age-aware range selection, abnormal flagging, section-wise
// remarks and method) — duplicating it for a PDF library would guarantee
// drift between what's on screen and what's emailed.
//
// The page is loaded at /report/:id/export: a bare route with no navbar and
// no action bar, so the only .no-print elements left in the tree are the
// letterhead header and the signature blocks — both of which an emailed PDF
// *must* include (unlike paper, which is pre-printed letterhead). Emulating
// `screen` media keeps them visible, which is why no CSS changes are needed.

let browserPromise = null;

// Launches a fresh browser and wires it to self-evict from the cache the
// moment its connection drops. Observed directly in production use: the
// Chrome process can keep running for hours after the WebSocket connection
// to it dies, so a plain "is there a cached promise" check isn't enough —
// every future getBrowser() call would keep handing back that same broken
// reference, and every PDF/email render would fail until the whole server
// process was restarted.
function launchBrowser() {
  const puppeteer = require('puppeteer');
  const launched = puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  launched
    .then((browser) => {
      browser.on('disconnected', () => {
        if (browserPromise === launched) browserPromise = null;
      });
    })
    .catch(() => {
      // A launch failure is handled below, where the rejection is awaited —
      // this branch only exists so the listener-attach step itself can't
      // produce an unhandled rejection.
    });

  return launched;
}

// Awaits the cached promise, discarding it (and, if the browser resolved but
// turned out disconnected, its now-orphaned process) on any failure so the
// caller always gets a fresh attempt rather than a promise that will just
// fail the same way forever.
async function resolveBrowser() {
  let browser;
  try {
    browser = await browserPromise;
  } catch (error) {
    browserPromise = null;
    throw error;
  }

  if (!browser.isConnected()) {
    browserPromise = null;
    // Best-effort cleanup of the now-orphaned process — this exact incident
    // proved the old Chrome process can keep running after its connection
    // drops, and leaving it running would leak one more process per drop.
    try {
      browser.process()?.kill();
    } catch (_) {
      // Already gone, or never had a local process handle — nothing to do.
    }
    throw new Error('Puppeteer browser was disconnected');
  }

  return browser;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser();
  }

  try {
    return await resolveBrowser();
  } catch (_) {
    // One retry with a guaranteed-fresh launch — covers both a rejected
    // launch and a cached browser that turned out disconnected. A second
    // consecutive failure is a real problem (e.g. Chromium missing or out
    // of resources) and is allowed to propagate.
    browserPromise = launchBrowser();
    return resolveBrowser();
  }
}

async function closeBrowser() {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch (_) {
      // Nothing useful to do on shutdown.
    }
    browserPromise = null;
  }
}

// Short-lived token so the headless page can authenticate as the requesting
// user — it therefore sees exactly what that user could see anyway.
function mintRenderToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '5m',
  });
}

function frontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:8080').replace(/\/$/, '');
}

async function renderReportPdf(reportId, user) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    const token = mintRenderToken(user);
    // AuthContext rehydrates from this exact pair and decodes the JWT to
    // check expiry, so both must be present and the token must be unexpired.
    const storedUser = JSON.stringify({
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
    });

    await page.evaluateOnNewDocument(
      (t, u) => {
        localStorage.setItem('patho_token', t);
        localStorage.setItem('patho_user', u);
      },
      token,
      storedUser
    );

    await page.goto(`${frontendUrl()}/report/${reportId}/export`, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // Set by ReportExportView once report + type + lab settings have loaded.
    await page.waitForSelector('[data-report-ready="true"]', { timeout: 30000 });

    // Critical: without this the print stylesheet hides the letterhead and
    // the signature blocks, which an emailed PDF needs.
    await page.emulateMediaType('screen');

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
    });

    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

// Renders several reports concurrently instead of one at a time. Bounded
// (not a plain Promise.all) because each render is a real Chromium tab that
// boots the whole frontend SPA against two 30s timeouts (networkidle0 +
// data-report-ready) — too many simultaneous tabs on a small box make those
// timeouts fire instead of just taking longer, trading a slow success for a
// hard failure. The shared browser from getBrowser() already supports
// multiple concurrent pages, so this needed no change to renderReportPdf.
//
// Results are written into a pre-sized array by index, never pushed, so
// completion order (which the concurrency means is NOT input order) can
// never reorder pages in the caller's merged PDF — the worst possible
// failure mode here, since it would ship silently wrong-order pages in a
// patient's report rather than erroring.
async function renderReportsPdfs(reportIds, user, { concurrency } = {}) {
  const limit = Math.max(1, concurrency || Number(process.env.PDF_RENDER_CONCURRENCY) || 3);
  const results = new Array(reportIds.length);
  let nextIndex = 0;

  async function runNext() {
    const i = nextIndex++;
    if (i >= reportIds.length) return;
    results[i] = await renderReportPdf(reportIds[i], user);
    return runNext();
  }

  await Promise.all(Array.from({ length: Math.min(limit, reportIds.length) }, runNext));
  return results;
}

// Concatenates already-rendered per-report PDF buffers into one document, in
// the given order. Each source report keeps rendering exactly as it does
// standalone (own letterhead, own signature block) — this is concatenation
// of already-complete signed documents, not a redesigned combined layout.
// pdf-lib is pure JS (no native binary, unlike Puppeteer itself) and handles
// the actual page-tree/xref merging, which isn't worth hand-rolling.
async function mergePdfBuffers(buffers) {
  const { PDFDocument } = require('pdf-lib');
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const source = await PDFDocument.load(buf);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  return Buffer.from(await merged.save());
}

process.on('exit', closeBrowser);
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

module.exports = { renderReportPdf, renderReportsPdfs, mergePdfBuffers, closeBrowser };
