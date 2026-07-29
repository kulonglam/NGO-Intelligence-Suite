# SDD PDF Export

**Owner:** Platform Lead · **Status:** Approved · **Last Reviewed:** 2026-07-27

Builds a single, book-structured PDF from the authoritative Markdown set under `docs/sdd/`.

## Output

| File | Contents |
| --- | --- |
| [`pdf/NGOIS-SDD-v2.0.pdf`](../../pdf/NGOIS-SDD-v2.0.pdf) | Cover · linked Contents · Document Control · Parts I–VI (01–35) · Appendices A–I · 20 ADRs · 16 runbooks |

Structure in the PDF:

1. **Cover** — title, metadata, classification
2. **Contents** — nested by part, clickable links to each chapter
3. **Document Control** — front matter
4. **Parts I–VI** — part banner on the first chapter of each part; chapters start on new pages
5. **Appendices, ADRs, Runbooks** — same chapter treatment

PDF bookmarks (sidebar outline) nest chapters under their part. Markdown remains the source of truth; regenerate the PDF rather than editing it.

## Build

Requires Google Chrome at the default install path, and Node.js 20+.

```powershell
cd docs/sdd/tools/pdf
npm install
node build.mjs
```

Typical runtime is 8–15 minutes (most of that is rendering Mermaid diagrams).

## Cadence

Regenerate at each phase boundary, and after any Approved chapter change that executives or auditors consume as PDF ([00 §4](../../00-front-matter.md)).
