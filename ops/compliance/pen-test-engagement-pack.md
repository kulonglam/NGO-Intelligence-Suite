# Penetration test engagement pack (Phase 1 gate #12)

> Gate #12 stays **BLOCKED** until an external firm reports no Critical/High findings. This pack prepares the engagement; it does not claim the gate.

## Scope (in)

- API gateway (`/v1/*`), auth, tenant isolation, RBAC
- Beneficiary / field / payroll trust boundaries
- Webhook egress SSRF controls
- Offline sync endpoints

## Scope (out)

- Social engineering of tenant staff
- Physical facility
- Third-party SaaS (SendGrid, LLM providers) beyond our adapter surface

## Assets to provide

1. Staging URL + break-glass credentials (time-boxed)
2. Architecture overview: `docs/sdd/05-architecture-diagrams.md`, `14-security-architecture.md`
3. STRIDE register: `docs/sdd/16-threat-model-stride.md`
4. Self-check inventory: `npm run pen-test:selfcheck` → `ops/drills/evidence/pen-test-selfcheck.json`

## Rules of engagement

- No production beneficiary PII
- Rate limits may be raised for the window with audit
- Findings triaged P1–P4 against `ops/incident-process.md`

## Closure criterion

External report with zero Critical/High outstanding → flip gate #12 to PASS on `ops/phase1-gate-status.md`.
