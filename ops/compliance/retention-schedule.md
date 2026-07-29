# Retention sweep — prod schedule note

Local / CI default is **dry-run**:

```powershell
npm run retention:sweep
# apply (ops only): node scripts/retention-sweep.mjs --apply
```

## Intended production schedule

| Cadence | Job | Notes |
| --- | --- | --- |
| Daily 02:00 UTC | `retention-sweep.mjs --apply` | Soft-delete expired `file_objects` not under legal hold |
| Weekly | Review `.data/retention/*.json` reports | Escalate holds / failures |
| On DSAR/erasure | No hard-delete of audit | Erasure tomstones PII; backups age out per RB-11 |

Wire as CronJob / Cloud Scheduler against the ops image; keep dry-run as the CI default.
