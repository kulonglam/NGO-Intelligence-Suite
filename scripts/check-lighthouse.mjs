/**
 * Lighthouse CI gate (SDD §19.8 / PE-09).
 * Serves frontend/dist (or uses LHCI_URL), audits /login with mobile profile.
 *
 * Thresholds (overridable via env):
 *   LH_A11Y_MIN=1        accessibility score
 *   LH_PERF_MIN=0.85     performance score
 *   LH_LCP_MS=3000
 *   LH_CLS_MAX=0.1
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'frontend', 'dist');
const require = createRequire(import.meta.url);

const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome');

const A11Y_MIN = Number(process.env.LH_A11Y_MIN ?? '1');
const PERF_MIN = Number(process.env.LH_PERF_MIN ?? '0.85');
const LCP_MS = Number(process.env.LH_LCP_MS ?? '3000');
const CLS_MAX = Number(process.env.LH_CLS_MAX ?? '0.1');
const PORT = Number(process.env.LHCI_PORT ?? '4173');
const PATHNAME = process.env.LHCI_PATH ?? '/login';

function findChrome() {
  if (existsSync(CHROME)) return CHROME;
  const alts =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        ]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  return alts.find((p) => existsSync(p)) ?? null;
}

async function ensureLighthouse() {
  try {
    return require.resolve('lighthouse');
  } catch {
    const { spawnSync } = await import('node:child_process');
    console.log('Installing lighthouse…');
    const r = spawnSync('npm', ['install', '-D', 'lighthouse@12'], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
    });
    if (r.status !== 0) throw new Error('Failed to install lighthouse');
    return require.resolve('lighthouse');
  }
}

async function waitFor(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error('Chrome not found — set CHROME_PATH');
    process.exit(1);
  }
  if (!existsSync(dist) && !process.env.LHCI_URL) {
    console.error('frontend/dist missing — run npm run build:frontend first');
    process.exit(1);
  }

  await ensureLighthouse();
  const lighthouse = (await import('lighthouse')).default;
  const chromeLauncher = await import('chrome-launcher');

  let preview = null;
  let base = process.env.LHCI_URL;
  if (!base) {
    preview = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['--yes', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
      {
        cwd: join(root, 'frontend'),
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        env: { ...process.env },
      },
    );
    base = `http://127.0.0.1:${PORT}`;
    try {
      await waitFor(base);
    } catch (err) {
      preview.kill();
      throw err;
    }
  }

  const url = `${base.replace(/\/$/, '')}${PATHNAME}`;
  console.log(`Lighthouse (mobile) → ${url}`);

  let chrome;
  let failed = false;
  try {
    chrome = await chromeLauncher.launch({
      chromePath,
      chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });
    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility'],
      formFactor: 'mobile',
      screenEmulation: {
        mobile: true,
        width: 360,
        height: 640,
        deviceScaleFactor: 2,
        disabled: false,
      },
      throttlingMethod: 'simulate',
      throttling: {
        rttMs: 150,
        throughputKbps: 1638.4,
        cpuSlowdownMultiplier: 4,
        requestLatencyMs: 150,
        downloadThroughputKbps: 1638.4,
        uploadThroughputKbps: 675,
      },
    });

    const lhr = result.lhr;
    const a11y = lhr.categories.accessibility?.score ?? 0;
    const perf = lhr.categories.performance?.score ?? 0;
    const lcp = lhr.audits['largest-contentful-paint']?.numericValue ?? Infinity;
    const cls = lhr.audits['cumulative-layout-shift']?.numericValue ?? Infinity;

    function check(label, ok, detail) {
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${detail}`);
      if (!ok) failed = true;
    }

    check('accessibility', a11y >= A11Y_MIN, `${(a11y * 100).toFixed(0)} (min ${(A11Y_MIN * 100).toFixed(0)})`);
    check('performance', perf >= PERF_MIN, `${(perf * 100).toFixed(0)} (min ${(PERF_MIN * 100).toFixed(0)})`);
    check('LCP', lcp <= LCP_MS, `${Math.round(lcp)} ms (max ${LCP_MS})`);
    check('CLS', cls <= CLS_MAX, `${cls.toFixed(3)} (max ${CLS_MAX})`);

    if (a11y < A11Y_MIN) {
      const fails = Object.values(lhr.audits)
        .filter((a) => a.score !== null && a.score < 1 && a.details?.type === 'table')
        .slice(0, 8)
        .map((a) => `  - ${a.id}: ${a.title}`);
      if (fails.length) {
        console.log('Top accessibility findings:');
        console.log(fails.join('\n'));
      }
    }
  } finally {
    if (chrome) await chrome.kill();
    if (preview) {
      preview.kill('SIGTERM');
    }
  }

  if (failed) process.exit(1);
  console.log('Lighthouse gate passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
