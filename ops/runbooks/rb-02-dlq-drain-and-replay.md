# RB-02 — DLQ drain / report queue (ops stub)

Canonical procedure: [`docs/sdd/runbooks/rb-02-dlq-drain-and-replay.md`](../../docs/sdd/runbooks/rb-02-dlq-drain-and-replay.md).

**Phase 2 alerts:** `ReportQueueDepthHigh`, `OutboxRelayStalled` → this runbook.
**Local tooling:** `scripts/reporting-worker.mjs` claims fair-share report jobs.
