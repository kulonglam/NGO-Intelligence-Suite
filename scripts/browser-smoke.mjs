/**
 * Browser smoke: en journey + axe serious/critical + Arabic RTL path.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome');
const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5173';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.data', 'browser-test');
mkdirSync(outDir, { recursive: true });

const require = createRequire(import.meta.url);
let axeSource = null;
try {
  const axePath = require.resolve('axe-core/axe.min.js');
  axeSource = (await import('node:fs')).readFileSync(axePath, 'utf8');
} catch {
  /* install below */
}

async function ensureAxe() {
  if (axeSource) return;
  const { spawnSync } = await import('node:child_process');
  spawnSync('npm', ['install', '-D', 'axe-core@4'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  const axePath = require.resolve('axe-core/axe.min.js');
  axeSource = (await import('node:fs')).readFileSync(axePath, 'utf8');
}

await ensureAxe();

async function waitFor(url, attempts = 40) {
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

async function fillByLabel(page, labelText, value) {
  const ok = await page.evaluate(
    (text, val) => {
      const labels = [...document.querySelectorAll('label')];
      const label = labels.find((l) => (l.textContent ?? '').trim() === text);
      if (!label) return false;
      let input = null;
      if (label.htmlFor) input = document.getElementById(label.htmlFor);
      if (!input) input = label.querySelector('input');
      if (!input && label.parentElement) input = label.parentElement.querySelector('input');
      if (!(input instanceof HTMLInputElement)) return false;
      input.focus();
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    labelText,
    value,
  );
  if (!ok) throw new Error(`No input for label "${labelText}"`);
}

async function runAxe(page, label) {
  await page.evaluate(axeSource);
  const results = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return {
      violations: r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
      })),
    };
  });
  const bad = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  writeFileSync(join(outDir, `axe-${label}.json`), JSON.stringify(results, null, 2));
  return bad;
}

const headless = process.env.BROWSER_HEADLESS !== '0';
const browser = await puppeteer.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  channel: existsSync(CHROME) ? undefined : 'chrome',
  headless,
  defaultViewport: { width: 1280, height: 800 },
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
const errors = [];

try {
  console.log('Waiting for frontend…');
  await waitFor(BASE);
  console.log('Waiting for gateway…');
  await waitFor('http://127.0.0.1:3000/v1/health');

  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });

  await fillByLabel(page, 'Email', 'admin@design-partner.example');
  await fillByLabel(page, 'Password', 'changeme');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForFunction(() => !location.pathname.includes('login'), { timeout: 20000 });
  await page.screenshot({ path: join(outDir, '02-home.png'), fullPage: true });

  const axeHome = await runAxe(page, 'home-en');
  if (axeHome.length) {
    errors.push(`axe serious/critical on home: ${axeHome.map((v) => v.id).join(', ')}`);
  }

  // Grouped shell IA: navigate by URL (Grants lives under Programmes, may be collapsed).
  await page.goto(`${BASE}/grants`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('table, .empty, form.create', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: join(outDir, '03-grants.png'), fullPage: true });

  const grantsText = await page.evaluate(() => document.body.innerText);
  if (!/SSD-2026-001/.test(grantsText)) {
    errors.push('Seed grant SSD-2026-001 not visible');
  }
  if (/UGA-2026-001|KEN-2026-001|Should never be visible/.test(grantsText)) {
    errors.push('Other tenant grant leaked');
  }

  const axeGrants = await runAxe(page, 'grants-en');
  if (axeGrants.length) {
    errors.push(`axe serious/critical on grants: ${axeGrants.map((v) => v.id).join(', ')}`);
  }

  const stamp = Date.now().toString().slice(-6);
  const number = `SSD-2026-${stamp}`;
  await fillByLabel(page, 'Number', number);
  await fillByLabel(page, 'Title', `Browser smoke ${stamp}`);
  await fillByLabel(page, 'Donor', 'FCDO');
  await page.click('form.create button[type="submit"]');
  await page.waitForFunction(
    (n) => document.body.innerText.includes(n),
    { timeout: 15000 },
    number,
  );

  const detailLink = await page.$(`a[href*="/grants/"]`);
  if (detailLink) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => null),
      detailLink.click(),
    ]);
    await page.waitForFunction(
      () => /Ceiling|Committed|Remaining|سقف/i.test(document.body.innerText),
      { timeout: 15000 },
    );
    await page.screenshot({ path: join(outDir, '05-grant-detail.png'), fullPage: true });
  } else {
    errors.push('No grant detail link found');
  }

  // Arabic RTL path
  console.log('Switching locale to Arabic…');
  await page.select('select[aria-label="Language"], select[aria-label="اللغة"]', 'ar').catch(
    async () => {
      await page.evaluate(async () => {
        localStorage.setItem('ngois_locale', 'ar');
        location.reload();
      });
      await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => null);
    },
  );
  await new Promise((r) => setTimeout(r, 1500));
  const dir = await page.evaluate(() => document.documentElement.dir);
  if (dir !== 'rtl') {
    // force via locale store UI
    const switched = await page.evaluate(() => {
      const sel = document.querySelector('select');
      if (!sel) return false;
      sel.value = 'ar';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    });
    await new Promise((r) => setTimeout(r, 1500));
    const dir2 = await page.evaluate(() => document.documentElement.dir);
    if (dir2 !== 'rtl') {
      errors.push(`Expected dir=rtl after Arabic switch, got ${dir2} (select=${switched})`);
    }
  }
  await page.screenshot({ path: join(outDir, '06-rtl-home.png'), fullPage: true });

  // Ensure still authenticated and can open grants in AR
  const pathNow = await page.evaluate(() => location.pathname);
  if (pathNow.includes('login')) {
    await fillByLabel(page, 'البريد الإلكتروني', 'admin@design-partner.example').catch(() =>
      fillByLabel(page, 'Email', 'admin@design-partner.example'),
    );
    await fillByLabel(page, 'كلمة المرور', 'changeme').catch(() =>
      fillByLabel(page, 'Password', 'changeme'),
    );
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !location.pathname.includes('login'), { timeout: 20000 });
  }

  await page.goto(`${BASE}/grants`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('table', { timeout: 15000 });
  const rtlDir = await page.evaluate(() => document.documentElement.dir);
  if (rtlDir !== 'rtl') errors.push(`Grants page dir=${rtlDir}, expected rtl`);
  await page.screenshot({ path: join(outDir, '07-rtl-grants.png'), fullPage: true });

  const firstDetail = await page.$(`a[href*="/grants/"]`);
  if (firstDetail) {
    await firstDetail.click();
    await page.waitForFunction(
      () => /سقف|Ceiling|الملتزم|Committed/i.test(document.body.innerText),
      { timeout: 15000 },
    );
    await page.screenshot({ path: join(outDir, '08-rtl-detail.png'), fullPage: true });
  }

  const axeRtl = await runAxe(page, 'detail-ar');
  if (axeRtl.length) {
    errors.push(`axe serious/critical on RTL detail: ${axeRtl.map((v) => v.id).join(', ')}`);
  }

  writeFileSync(
    join(outDir, 'result.json'),
    JSON.stringify({ ok: errors.length === 0, errors, base: BASE, at: new Date().toISOString() }, null, 2),
  );

  if (errors.length) {
    console.error('SMOKE FAILED');
    for (const e of errors) console.error(' -', e);
    process.exitCode = 1;
  } else {
    console.log('SMOKE PASSED (en + axe + ar RTL)');
    console.log('Screenshots in', outDir);
  }
} catch (err) {
  await page.screenshot({ path: join(outDir, 'error.png'), fullPage: true }).catch(() => null);
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
