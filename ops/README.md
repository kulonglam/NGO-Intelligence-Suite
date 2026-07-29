# Operations baseline (stubs)

Phase 1 operations artefacts. Runbook content lives in [`docs/sdd/runbooks/`](../docs/sdd/runbooks/); this folder holds process stubs and drill records.

## Phase 1 runbooks (required)

| ID | Topic | SDD path |
| --- | --- | --- |
| RB-03 | Database failover | `docs/sdd/runbooks/rb-03-database-failover.md` |
| RB-05 | Tenant onboarding | `docs/sdd/runbooks/rb-05-tenant-onboarding.md` |
| RB-08 | Scale event | `docs/sdd/runbooks/rb-08-scale-event.md` |
| RB-09 | Secret rotation | `docs/sdd/runbooks/rb-09-secret-rotation.md` |
| RB-11 | Backup restore drill | `docs/sdd/runbooks/rb-11-backup-restore-drill.md` |
| RB-13 | Service down | `docs/sdd/runbooks/rb-13-service-down.md` |
| RB-14 | Security incident | `docs/sdd/runbooks/rb-14-security-incident.md` |

## Files here

| File | Purpose |
| --- | --- |
| `on-call.md` | Rotation stub |
| `incident-process.md` | SEV levels + declare-first notes |
| `alert-runbook-map.yaml` | Source of truth for CI gate #11 |
| `drills/backup-restore.md` | Drill record template |
| `drills/regional-failover.md` | Warm-DR drill template |

```powershell
npm run verify:alerts-runbooks
```
