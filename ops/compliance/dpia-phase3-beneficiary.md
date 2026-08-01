# Phase 3 DPIA — Beneficiary / field data (DPO-approved)

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Scope | Beneficiaries, households, vulnerability assessments, field submissions, offline device cache, paper bulk entry, LMS enrollment notifications (no PII in SMS) |
| Controller | Tenant NGO |
| Processor | NGO Intelligence Suite operator |
| Status | **DPO reviewed** |

## Lawful bases

- Legitimate interest / contractual necessity for programme delivery and accountability to donors
- Explicit consent where required for biometric or special-category data (not collected in Tranche 1 field forms)
- Vital interests for safeguarding escalation pathways

## Data subject rights

- Access via DSAR workflow (`tenant-service`)
- Rectification via field review queue / beneficiary update
- Erasure via erasure request / approve paths (Phase 2)
- Objection to automated scoring: vulnerability scores are advisory only

## Retention

- Field submissions: programme retention schedule + audit chain
- Offline cache: 72-hour TTL; wiped on logout / remote wipe
- Notification deliveries: audit retention; SMS bodies never include PII figures

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Device seizure of beneficiary list | Minimised cache; session-key AES-GCM; remote wipe |
| Silent duplicate merge | Dedup flags only; never auto-merge |
| Score used as automatic exclusion | Advisory scores; human enrolment |
| Offline submission loss | `client_uuid` idempotency; paper bulk provenance |
| Aggregate re-identification | I.8 k-anonymity (k=5) on publish preview |

## Erasure + DSAR

Aligned with Phase 2 erasure/DSAR; beneficiary erasure requests covered under `beneficiary:erasure:*` permissions.

## Checklist

- [x] DPO reviewed
- [x] Lawful bases documented
- [x] Data subject rights
- [x] Retention
- [x] Erasure + DSAR
- [x] Offline cache TTL / wipe triggers tested (`smoke:phase3-e2e`)
- [x] k-anonymity for aggregates (`@ngois/k-anonymity`)
