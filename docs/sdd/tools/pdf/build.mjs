/**
 * NGO Intelligence Suite — SDD v2.0 single-book PDF builder
 *
 * Produces one well-structured PDF:
 *   cover → contents (linked) → document control → Parts I–VI →
 *   Appendices → ADRs → Runbooks
 *
 * Usage:
 *   node build.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { marked } from 'marked';
import puppeteer from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDD_ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(SDD_ROOT, 'pdf');
const DIAG_DIR = join(OUT_DIR, '_diagrams');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// ---------------------------------------------------------------------------
// Book structure
// ---------------------------------------------------------------------------

const BOOK = [
  {
    part: null,
    files: ['00-front-matter.md'],
  },
  {
    part: { id: 'part-i', number: 'I', title: 'Context' },
    files: [
      '01-executive-summary.md',
      '02-introduction.md',
      '03-system-overview-and-context.md',
      '04-architecture-principles.md',
    ],
  },
  {
    part: { id: 'part-ii', number: 'II', title: 'Architecture' },
    files: [
      '05-architecture-diagrams.md',
      '06-microservice-design.md',
      '07-domain-model-and-erd.md',
      '08-database-schema.md',
      '09-data-management-strategy.md',
    ],
  },
  {
    part: { id: 'part-iii', number: 'III', title: 'Interfaces' },
    files: [
      '10-api-design-standards.md',
      '11-event-driven-architecture.md',
      '12-integration-architecture.md',
      '13-offline-first-architecture.md',
    ],
  },
  {
    part: { id: 'part-iv', number: 'IV', title: 'Security and Compliance' },
    files: [
      '14-security-architecture.md',
      '15-rbac-and-authorization.md',
      '16-threat-model-stride.md',
      '17-privacy-and-compliance.md',
      '18-ai-llm-architecture.md',
    ],
  },
  {
    part: { id: 'part-v', number: 'V', title: 'Delivery and Operations' },
    files: [
      '19-frontend-architecture.md',
      '20-configuration-secrets-feature-flags.md',
      '21-deployment-and-infrastructure.md',
      '22-cicd-release-supply-chain.md',
      '23-testing-strategy.md',
      '24-observability.md',
      '25-performance-and-capacity.md',
      '26-reliability-and-incident-management.md',
      '27-disaster-recovery-and-bcp.md',
      '28-operational-runbooks.md',
      '29-multi-tenancy-and-tenant-lifecycle.md',
    ],
  },
  {
    part: { id: 'part-vi', number: 'VI', title: 'Planning and Governance' },
    files: [
      '30-quality-attributes-nfr.md',
      '31-implementation-roadmap.md',
      '32-risk-register.md',
      '33-cost-model-and-finops.md',
      '34-future-extensibility.md',
      '35-engineering-standards.md',
    ],
  },
  {
    part: { id: 'part-appendices', number: null, title: 'Appendices' },
    files: [
      'appendices/a-glossary.md',
      'appendices/b-data-dictionary.md',
      'appendices/c-rbac-matrix.md',
      'appendices/d-event-catalog.md',
      'appendices/e-error-codes.md',
      'appendices/f-adr-index.md',
      'appendices/g-runbook-index.md',
      'appendices/h-compliance-traceability.md',
      'appendices/i-algorithms.md',
    ],
  },
  {
    part: { id: 'part-adrs', number: null, title: 'Architecture Decision Records' },
    files: readdirSync(join(SDD_ROOT, 'adr'))
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => `adr/${f}`),
  },
  {
    part: { id: 'part-runbooks', number: null, title: 'Operational Runbooks' },
    files: readdirSync(join(SDD_ROOT, 'runbooks'))
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => `runbooks/${f}`),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function readMd(relPath) {
  return readFileSync(join(SDD_ROOT, relPath), 'utf8');
}

function chapterTitle(relPath) {
  const line = readMd(relPath).split(/\r?\n/).find((l) => /^#\s+/.test(l));
  return line ? line.replace(/^#\s+/, '').trim() : relPath;
}

function chapterId(relPath) {
  const base = basename(relPath, '.md');
  if (/^\d{2}-/.test(base)) return `ch-${base.slice(0, 2)}`;
  if (base.startsWith('rb-')) return base;
  if (/^\d{4}-/.test(base)) return `adr-${base.slice(0, 4)}`;
  if (/^[a-i]-/.test(base)) return `app-${base.charAt(0)}`;
  return slugify(base);
}

/** Drop relative .md links; keep external URLs visible. */
function rewriteLinks(md) {
  return md
    .replace(/\[([^\]]+)\]\((?!https?:|mailto:|#)([^)#]+)(?:#[^)]*)?\)/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)');
}

/**
 * Compact the chapter control blockquote (Owner / Status / …) into a single
 * metadata strip so chapters open on the title, not a wall of meta.
 */
function compactControlBlock(md) {
  return md.replace(/^>\s*\*\*Document:\*\*[^\n]*(?:\n>\s*[^\n]*)*/m, (block) => {
    const fields = {};
    for (const line of block.split(/\n/)) {
      const m = line.match(/\*\*([^*]+):\*\*\s*(.+)/);
      if (m) fields[m[1].trim()] = m[2].trim();
    }
    const bits = ['Owner', 'Status', 'Last Reviewed', 'Related ADRs']
      .filter((k) => fields[k])
      .map((k) => `**${k}:** ${fields[k]}`);
    if (bits.length === 0) return block;
    return `<p class="chapter-meta">${bits.join(' · ')}</p>\n`;
  });
}

function extractMermaid(md, prefix) {
  const diagrams = [];
  let i = 0;
  const out = md.replace(/```mermaid\s*\n([\s\S]*?)```/g, (_, src) => {
    const id = `${prefix}-${String(++i).padStart(3, '0')}`;
    diagrams.push({ id, src: src.trim() });
    return `\n\n![Diagram ${id}](_diagrams/${id}.svg)\n\n`;
  });
  return { md: out, diagrams };
}

/**
 * Demote markdown headings by one level so the chapter title can be the sole h1
 * injected by the assembler. Source `#` → `##`, `##` → `###`, … up to ######.
 */
function demoteHeadings(md) {
  return md.replace(/^(#{1,5})\s+/gm, (_, hashes) => `${hashes}# `);
}

function stripLeadingH1(md) {
  return md.replace(/^#\s+[^\n]+\n+/, '');
}

// ---------------------------------------------------------------------------
// Assemble book
// ---------------------------------------------------------------------------

function assemble() {
  marked.setOptions({ gfm: true, breaks: false });
  const toc = [];
  const sections = [];
  const diagrams = [];
  let fileIndex = 0;

  for (const group of BOOK) {
    const part = group.part;
    if (part) {
      toc.push({
        type: 'part',
        id: part.id,
        label: part.number ? `Part ${part.number} — ${part.title}` : part.title,
      });
    }

    let firstInPart = true;
    for (const relPath of group.files) {
      fileIndex += 1;
      const id = chapterId(relPath);
      const title = chapterTitle(relPath);
      toc.push({ type: 'chapter', id, title });

      const extracted = extractMermaid(readMd(relPath), `d${String(fileIndex).padStart(3, '0')}`);
      diagrams.push(...extracted.diagrams);

      let body = stripLeadingH1(extracted.md);
      body = compactControlBlock(body);
      body = rewriteLinks(body);
      body = demoteHeadings(body);

      const partBanner =
        part && firstInPart
          ? `<header class="part-banner" id="${escapeHtml(part.id)}">
              <p class="part-kicker">${part.number ? `Part ${escapeHtml(part.number)}` : 'Section'}</p>
              <h1 class="part-title">${escapeHtml(part.title)}</h1>
            </header>`
          : '';

      // Front matter (no part): chapter is h1. Under a part: chapter is h2 so the
      // PDF outline nests chapters beneath parts.
      const titleTag = part ? 'h2' : 'h1';

      sections.push(`
<section class="chapter${firstInPart && part ? ' chapter-opens-part' : ''}" id="${escapeHtml(id)}" data-source="${escapeHtml(relPath)}">
  ${partBanner}
  <${titleTag} class="chapter-title">${escapeHtml(title)}</${titleTag}>
  ${marked.parse(body)}
</section>`);
      firstInPart = false;
    }
  }

  return { toc, htmlBody: sections.join('\n'), diagrams };
}

// ---------------------------------------------------------------------------
// Mermaid
// ---------------------------------------------------------------------------

async function renderDiagrams(browser, diagrams) {
  if (!diagrams.length) return;
  mkdirSync(DIAG_DIR, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });

  const require = createRequire(import.meta.url);
  const mermaidJs = readFileSync(require.resolve('mermaid/dist/mermaid.min.js'), 'utf8');

  let ok = 0;
  let fail = 0;
  for (const d of diagrams) {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;background:#fff}#c{display:inline-block;padding:12px}</style></head>
<body><div id="c"></div><script>${mermaidJs}</script>
<script>
window.__done=false;window.__err=null;window.__svg=null;
mermaid.initialize({startOnLoad:false,securityLevel:'loose',theme:'neutral',
  flowchart:{useMaxWidth:false,htmlLabels:true},sequence:{useMaxWidth:false},er:{useMaxWidth:false}});
(async()=>{try{const r=await mermaid.render('m-${d.id}',${JSON.stringify(d.src)});window.__svg=r.svg;}
catch(e){window.__err=String(e&&e.message?e.message:e);}finally{window.__done=true;}})();
</script></body></html>`;
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__done===true', { timeout: 30000 });
    const result = await page.evaluate(() => ({ svg: window.__svg, err: window.__err }));
    let svg = result.svg;
    if (result.err || !svg) {
      fail++;
      console.warn(`  mermaid FAIL ${d.id}: ${result.err || 'empty'}`);
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="72">
        <rect width="100%" height="100%" fill="#f8f4f0" stroke="#a33"/>
        <text x="16" y="44" font-family="Segoe UI" font-size="13" fill="#a33">Diagram ${d.id} failed to render</text>
      </svg>`;
    } else {
      ok++;
      if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    writeFileSync(join(DIAG_DIR, `${d.id}.svg`), svg, 'utf8');
    if ((ok + fail) % 20 === 0) console.log(`  mermaid ${ok + fail}/${diagrams.length}`);
  }
  await page.close();
  console.log(`  mermaid: ${ok} ok, ${fail} failed / ${diagrams.length}`);
}

// ---------------------------------------------------------------------------
// HTML shell
// ---------------------------------------------------------------------------

const CSS = `
@page { size: A4; margin: 18mm 15mm 18mm 15mm; }
* { box-sizing: border-box; }
html { font-size: 10.25pt; }
body {
  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  color: #1c1c1c;
  line-height: 1.48;
  margin: 0;
  padding: 0;
}

/* ---- Cover ---- */
.cover {
  page-break-after: always;
  min-height: 250mm;
  padding: 28mm 8mm 20mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: linear-gradient(180deg, #f4f7f8 0%, #ffffff 42%);
  border-top: 8px solid #1f4e5f;
}
.cover .doc-type {
  font-size: 9pt; letter-spacing: 0.14em; text-transform: uppercase;
  color: #3d6b7a; font-weight: 650; margin: 0 0 14px;
}
.cover h1 {
  font-size: 30pt; color: #1f4e5f; margin: 0 0 6px; font-weight: 700;
  letter-spacing: -0.025em; line-height: 1.15; border: none; padding: 0;
}
.cover .subtitle {
  font-size: 15pt; color: #3d6b7a; margin: 0 0 28px; font-weight: 500;
}
.cover .meta-grid {
  display: grid; grid-template-columns: 42mm 1fr; gap: 5px 12px;
  font-size: 10pt; color: #333; max-width: 140mm;
}
.cover .meta-grid dt { color: #666; font-weight: 600; }
.cover .meta-grid dd { margin: 0; }
.cover .structure {
  margin-top: 28px; padding: 12px 14px; background: #fff; border: 1px solid #d5dee3;
  border-radius: 3px; font-size: 9.5pt; color: #333; line-height: 1.55; max-width: 155mm;
}
.cover .structure strong { color: #1f4e5f; }
.cover .classif {
  margin-top: 36px; padding: 10px 14px; background: #f3f0ea;
  border-left: 4px solid #8b4513; font-size: 9.5pt; color: #5a3a1a; max-width: 155mm;
}

/* ---- TOC ---- */
.toc { page-break-after: always; }
.toc > h1 {
  font-size: 20pt; color: #1f4e5f; border-bottom: 2px solid #1f4e5f;
  padding-bottom: 6px; margin: 0 0 16px;
}
.toc-list { list-style: none; margin: 0; padding: 0; }
.toc-part {
  margin: 14px 0 4px; padding: 5px 0 3px;
  font-size: 10.5pt; font-weight: 700; color: #1f4e5f;
  border-bottom: 1px solid #d5dee3;
}
.toc-part a { color: #1f4e5f; text-decoration: none; }
.toc-chapter {
  margin: 0; padding: 2px 0 2px 10px;
  font-size: 9.5pt; color: #222;
  display: flex; align-items: baseline; gap: 6px;
}
.toc-chapter a { color: #1c1c1c; text-decoration: none; flex: 1; }
.toc-chapter a:hover { color: #1f4e5f; }
.toc-chapter .toc-num {
  flex: 0 0 auto; color: #6a7f88; font-variant-numeric: tabular-nums; min-width: 1.6em;
}

/* ---- Parts & chapters ---- */
.part-banner {
  margin: 0 0 18px; padding: 14px 0 12px;
  border-bottom: 3px solid #1f4e5f;
  page-break-after: avoid;
}
.part-kicker {
  margin: 0 0 4px; font-size: 9pt; letter-spacing: 0.16em;
  text-transform: uppercase; color: #3d6b7a; font-weight: 650;
}
.part-title {
  margin: 0; font-size: 22pt; color: #1f4e5f; font-weight: 700;
  letter-spacing: -0.02em; border: none; padding: 0;
}
.chapter {
  page-break-before: always;
}
.chapter-opens-part {
  /* Part banner + chapter share the opening page */
}
.chapter-title {
  font-size: 16pt; color: #1f4e5f; border-bottom: 1.5px solid #9bb4bd;
  padding-bottom: 5px; margin: 0 0 10px; page-break-after: avoid;
}
.chapter-opens-part .chapter-title { margin-top: 8px; }
.chapter-meta {
  margin: 0 0 14px; font-size: 8.5pt; color: #555; line-height: 1.4;
  padding: 6px 10px; background: #f5f8f9; border-left: 3px solid #1f4e5f;
}

h2 {
  font-size: 12.5pt; color: #1f4e5f; margin: 1.35em 0 0.4em;
  page-break-after: avoid;
}
h3 {
  font-size: 11pt; color: #2a5f70; margin: 1.15em 0 0.35em;
  page-break-after: avoid;
}
h4 {
  font-size: 10.25pt; color: #333; margin: 1em 0 0.3em;
  page-break-after: avoid;
}
p { margin: 0.5em 0; orphans: 3; widows: 3; }
blockquote {
  margin: 0.7em 0; padding: 0.45em 0.85em; border-left: 3px solid #1f4e5f;
  background: #f5f8f9; color: #2a3a40;
}
code {
  font-family: "Cascadia Code", Consolas, "Courier New", monospace;
  font-size: 0.86em; background: #f0f2f4; padding: 0.08em 0.28em; border-radius: 2px;
}
pre {
  background: #f4f6f8; border: 1px solid #d8dee4; border-radius: 3px;
  padding: 7px 9px; overflow-x: auto; font-size: 7.6pt; line-height: 1.32;
  page-break-inside: avoid;
}
pre code { background: none; padding: 0; font-size: inherit; }
table {
  border-collapse: collapse; width: 100%; margin: 0.7em 0;
  font-size: 8pt; page-break-inside: auto;
}
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th, td {
  border: 1px solid #c5ced6; padding: 3px 5px; text-align: left; vertical-align: top;
}
th { background: #e8eef1; color: #1f4e5f; font-weight: 650; }
img {
  max-width: 100%; height: auto; display: block; margin: 8px auto;
  page-break-inside: avoid;
}
ul, ol { margin: 0.45em 0 0.45em 1.15em; padding: 0; }
li { margin: 0.18em 0; }
hr { border: none; border-top: 1px solid #c5ced6; margin: 1.2em 0; }
strong { font-weight: 650; }
a { color: #1f4e5f; text-decoration: none; }
`;

function coverHtml() {
  const generated = new Date().toISOString().slice(0, 10);
  return `<section class="cover">
  <p class="doc-type">Software Design Document</p>
  <h1>NGO Intelligence Suite</h1>
  <p class="subtitle">Version 2.0</p>
  <dl class="meta-grid">
    <dt>Identifier</dt><dd>NGOIS-SDD</dd>
    <dt>Status</dt><dd>Approved</dd>
    <dt>Classification</dt><dd>Confidential — Internal Use Only</dd>
    <dt>Supersedes</dt><dd>NGOIS-SDD v1.0 (20 June 2026)</dd>
    <dt>Generated</dt><dd>${generated}</dd>
    <dt>Source of truth</dt><dd>docs/sdd/ (Markdown chapter set)</dd>
  </dl>
  <div class="structure">
    <strong>Document structure</strong><br/>
    Document Control · Parts I–VI (chapters 01–35) · Appendices A–I ·
    Architecture Decision Records (20) · Operational Runbooks (RB-01–16)
  </div>
  <div class="classif">
    Must not be shared outside the organisation without written approval from the
    Executive Director and the Security Lead. A redacted donor due-diligence pack
    is derived separately from chapters 14–17 and Appendix H.
  </div>
</section>`;
}

function tocHtml(toc) {
  const items = [];
  let chapterOrdinal = 0;
  for (const entry of toc) {
    if (entry.type === 'part') {
      items.push(
        `<li class="toc-part"><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</a></li>`,
      );
    } else {
      chapterOrdinal += 1;
      items.push(
        `<li class="toc-chapter"><span class="toc-num">${chapterOrdinal}</span><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.title)}</a></li>`,
      );
    }
  }
  return `<nav class="toc" id="contents">
  <h1>Contents</h1>
  <ul class="toc-list">${items.join('\n')}</ul>
</nav>`;
}

function buildDocument(toc, bodyHtml) {
  marked.setOptions({ gfm: true, breaks: false });
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>NGO Intelligence Suite — Software Design Document v2.0</title>
<style>${CSS}</style>
</head>
<body>
${coverHtml()}
${tocHtml(toc)}
${bodyHtml}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------

async function printPdf(browser, htmlPath, pdfPath) {
  const page = await browser.newPage();
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  console.log('  loading HTML…');
  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 300000 });
  await new Promise((r) => setTimeout(r, 2000));

  // Ensure every chapter and part has an id for bookmarks / TOC
  await page.evaluate(() => {
    document.querySelectorAll('h1.chapter-title, h1.part-title, h2, h3').forEach((el, i) => {
      if (!el.id) {
        const text = (el.textContent || `h-${i}`).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
        el.id = el.id || `h-${text}-${i}`;
      }
    });
  });

  console.log('  printing PDF…');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-size:7.5px;width:100%;padding:0 14mm;color:#667;font-family:Segoe UI,sans-serif;display:flex;justify-content:space-between;">
        <span>NGO Intelligence Suite — SDD v2.0</span>
        <span>Confidential — Internal Use Only</span>
      </div>`,
    footerTemplate: `
      <div style="font-size:7.5px;width:100%;padding:0 14mm;color:#445;font-family:Segoe UI,sans-serif;display:flex;justify-content:space-between;">
        <span>NGOIS-SDD</span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    preferCSSPageSize: false,
    outline: true,
    tagged: true,
  });
  await page.close();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}`);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  if (existsSync(DIAG_DIR)) rmSync(DIAG_DIR, { recursive: true, force: true });
  mkdirSync(DIAG_DIR, { recursive: true });

  console.log('Assembling book…');
  const { toc, htmlBody, diagrams } = assemble();
  console.log(`  ${toc.filter((t) => t.type === 'chapter').length} chapters, ${diagrams.length} diagrams`);

  console.log('Launching Chrome…');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'],
  });

  try {
    await renderDiagrams(browser, diagrams);

    const html = buildDocument(toc, htmlBody);
    const htmlPath = join(OUT_DIR, 'NGOIS-SDD-v2.0.html');
    const pdfPath = join(OUT_DIR, 'NGOIS-SDD-v2.0.pdf');
    writeFileSync(htmlPath, html, 'utf8');
    console.log('  wrote NGOIS-SDD-v2.0.html');

    await printPdf(browser, htmlPath, pdfPath);
    const mb = (readFileSync(pdfPath).length / (1024 * 1024)).toFixed(1);
    console.log(`  wrote NGOIS-SDD-v2.0.pdf (${mb} MB)`);
    console.log('\nDone.');
    console.log(`  ${pdfPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
