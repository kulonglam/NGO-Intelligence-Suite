# Phase 4 gate status (SDD §31.5.2) — Intelligence

> Analytics, AI insights (redaction / HITL / budgets), IATI local publish, FinOps stubs. Live LLM providers and IATI Registry upload are **not** claimed.

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Analytics dashboard with as-of freshness | PASS (local) | `analytics-service` + `/intelligence` |
| 2 | KPI refresh from domain counts | PASS (local) | `POST /v1/analytics/kpis/refresh` |
| 3 | k-anonymity on aggregate preview | PASS (local) | `@ngois/k-anonymity` via analytics |
| 4 | Compliance score model | PASS (local) | `GET /v1/analytics/compliance-score` |
| 5 | Redaction corpus ≥400 zero leaks | PASS (local) | `test:ai-redaction` + corpus JSON |
| 6 | AI generate from aggregates only | PASS (local) | `ai-insights-service` + local LLM stub |
| 7 | HITL approve requires edit or attest | PASS (local) | `smoke:phase4-e2e` |
| 8 | Kill switch disables AI | PASS (local) | `ai_enabled=false` → 503 |
| 9 | Token budget exhaustion degrades visibly | PASS (local) | `NGOIS-AI-budget` 429 |
| 10 | Injection corpus zero compliance | PASS (local) | `eval:ai-injection` |
| 11 | IATI v2.03 validate + exclusion policy | PASS (local) | `integration-service` + PII seed stripped |
| 12 | IATI local publish artifact | PASS (local) | `ops/drills/evidence/iati/` |
| 13 | FinOps cost attribution stub | PASS (local) | `finops:attribution` |
| 14 | Tenant can disable AI without workflow loss | PASS (local) | kill switch; analytics/IATI still work |
| 15 | No AI write to person decision fields | PASS (local) | approve updates narrative status only |

```powershell
npm run test:ai-redaction
npm run eval:ai-injection
npm run verify:phase4-gates
npm run smoke:phase4-e2e
npm run finops:attribution
```
