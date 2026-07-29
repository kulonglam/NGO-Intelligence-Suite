# SDD Consistency Checks

**Owner:** Architecture Guild · **Status:** Approved · **Last Reviewed:** 2026-07-27

A document set of this size drifts silently. A service gets renamed in one chapter, an alert is renamed in the observability chapter but not in the runbook it pages to, a section is inserted and every `§` reference after it shifts by one. None of that is visible when reading a single chapter, and all of it is visible to a script.

These checks exist so the claims the SDD makes about itself are actually true. Chapter [28 §28.5.1](../28-operational-runbooks.md) states that every alert must name an existing runbook and that this is checked automatically; `check-alerts.ps1` is that check. The pipeline gate is in [22 §22.3.1](../22-cicd-release-supply-chain.md) and the standard in [35 §35.7.1](../35-engineering-standards.md). Run them on every change under `docs/sdd/`.

```powershell
powershell -ExecutionPolicy Bypass -File docs/sdd/tools/check-all.ps1
```

---

## The checks

| Script | What it proves | Gate |
| --- | --- | --- |
| `check-links.ps1` | Every relative Markdown link resolves to a file on disk | **Hard** |
| `check-sections.ps1` | Every `§` cross-reference names a heading that exists in the target chapter | **Hard** |
| `check-toc.ps1` | Every file in the set is reachable from `README.md`, and no README link is dead | **Hard** |
| `check-headers.ps1` | Every chapter, appendix, ADR and runbook carries its required control block; also reconciles each runbook's header facts against Appendix G | **Hard** |
| `check-ids.ps1` | Every `R-`, `T-`, `SLO-`, `D-`, `NFR-`, `A-`, `C-` and `CH-` identifier is defined before it is referenced | **Hard** |
| `check-services.ps1` | Service names and ports match chapter 06; no non-canonical role tokens | **Hard** |
| `check-obs.ps1` | Every `ngois_*` metric referenced anywhere is declared in chapter 24's registry | **Hard** |
| `check-event-totals.ps1` | Appendix D's stated counts match the rows in its own tables, and no event is listed twice | **Hard** |
| `mermaid/validate.mjs` | All 81 diagrams parse with the real Mermaid parser | **Hard** |
| `check-alerts.ps1` | Alert names in runbooks exist in chapter 24's alert catalog | Advisory |
| `check-events.ps1` | Event names used anywhere exist in Appendix D | Advisory |

Two of these need a note about what they deliberately ignore.

`check-obs.ps1` resolves `_bucket`, `_sum` and `_count` against their base metric, because Prometheus derives those series from any declared histogram or summary. A query in RB-16 naming `ngois_sync_queue_age_seconds_bucket` is therefore referencing a metric chapter 24 does declare, and is not a finding.

`check-event-totals.ps1` and `check-events.ps1` both skip names matching `<context>.events`, because those are the seven Redis streams, not events, and they appear in Appendix D's volume and ordering tables in the same column shape as a catalogue entry. Counting them inflated the event total by seven, which is exactly the class of error this check exists to catch — a summary row that stops matching the table above it.

All hard checks currently pass: 1,553 links, 597 section references, 81 diagrams, 81 indexed files, 15 services, 65 metrics, 89 events and 282 identifiers.

The Mermaid validator needs its dependencies installed once:

```bash
cd docs/sdd/tools/mermaid && npm install
```

---

## Why two checks are advisory rather than hard

These two cannot be made strict without either weakening the check or distorting the prose, so a human reads them instead. Each has a small, enumerated set of expected findings. **A finding not on this list is a real defect.**

| Expected finding | Why it is not a defect |
| --- | --- |
| `CertificateRequest` in RB-04 | A cert-manager custom resource kind, not an alert |
| `SecretSynced` in RB-12 | An external-secrets Kubernetes event, not an alert |
| `grant.disbursement_received` in chapter 11 and front matter | The v1.0 event name, cited deliberately to document the rename |
| `grant.record_disbursement` in chapter 11 | A command-form counter-example, used to explain why events are past tense |

`check-services.ps1` is a hard check but prints two role tokens for the same reason: `` `admin` `` in Appendix C is an action in the closed permission-action set, and `` `read_only` `` in Appendix D is a field in the `tenant.suspended` payload. Neither is a role, so neither counts toward the failure condition.

The alternative to a reviewed list — suppression comments scattered through the prose, or regexes tuned until these six cases disappear — would hide real drift. A short list someone actually reads is more honest than a green tick that means less than it appears to.

---

## What these checks do not catch

Worth stating plainly, so nobody mistakes a passing run for a correct document.

- **They check referential integrity, not truth.** A link can resolve to a chapter that says the wrong thing. `check-services.ps1` proves chapter 21 and chapter 06 agree on a port; it cannot prove either matches the deployed Helm chart.
- **They do not check prose against implementation.** Once services exist, the schema, RBAC matrix and event catalog should be generated from or diffed against code. Until then, those three appendices are asserted, not verified.
- **`check-sections.ps1` matches heading numbers, not heading meaning.** Renumbering a section and updating every reference to the new number passes even if the reference now points somewhere irrelevant.
- **`check-headers.ps1` verifies a `Last Reviewed` date is present, not that a review happened.** The same limitation applies to every runbook's `Last verified` field, which is why Appendix G §G.3 discusses the oldest dates rather than just listing them.
