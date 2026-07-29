# RB-10 — Hotfix Deployment

| | |
| --- | --- |
| **ID** | RB-10 |
| **Applies to** | A defect requiring a fix outside the normal release cadence |
| **Severity** | Follows the incident it addresses |
| **Owner** | Platform Lead |
| **Expected duration** | 45–90 minutes |
| **Last verified** | 2026-05-20, staging |
| **Related** | [22 §22.7](../22-cicd-release-supply-chain.md), [26 §26.4.1](../26-reliability-and-incident-management.md) |

---

## 1. Before you use this runbook

**A hotfix is rarely the fastest way out of an incident.** Check these first, in order:

| # | Option | Time | Use when |
| --- | --- | --- | --- |
| 1 | **Roll back** the last deployment | 2–5 min | The defect arrived with a recent release. **Almost always the right answer** |
| 2 | **Flip a kill switch** | < 1 min | The affected subsystem has one ([20 §20.5.2](../20-configuration-secrets-feature-flags.md)) |
| 3 | Change a per-tenant configuration | < 1 min | The defect is triggered by a specific configuration |
| 4 | **Hotfix** | 45–90 min | None of the above applies, or the defect predates the last release |

A hotfix is the slowest and highest-risk option because it puts new, lightly-tested code into production under time pressure. Use it when it is genuinely the only path.

## 2. Prerequisites

| Requirement | Detail |
| --- | --- |
| The defect is understood | A hotfix for a defect you do not understand is a second incident waiting |
| Authorisation | Incident Commander **plus** one of Platform Lead, Chief Architect or Security Lead ([22 §22.7](../22-cicd-release-supply-chain.md)) |
| A ticket created **before** the change | Stating what is being skipped and why |
| A second engineer for review | Code review is never skipped, however small the change |
| The rollback path is known | Before you start, not after |

## 3. Do not

- **Do not skip code review.** The smallest hotfixes cause the most incidents, precisely because they look too trivial to review.
- **Do not skip the non-skippable gates:** secret scanning, image signing, the tenant isolation suite, and migration lock-safety checks. Each protects against something worse than the incident you are fixing.
- **Do not include a schema migration in a hotfix** unless it is unavoidable. If it is, it must still be expand-only and backward-compatible.
- **Do not bundle unrelated changes.** A hotfix contains exactly one change.
- **Do not deploy directly to production, bypassing staging.** Even a five-minute staging pass catches the obvious mistakes.
- **Do not `kubectl edit` a deployment or patch an image tag by hand.** Argo will revert it at the next sync, at an unpredictable moment, and you will have a second incident with no obvious cause.

## 4. Procedure

### 4.1 Authorise and scope

1. Confirm rollback is genuinely not viable, and record why in the incident channel. This one sentence prevents most unnecessary hotfixes.

2. Obtain authorisation and create the hotfix ticket, recording: the defect, the affected users, why rollback is not viable, the change being made, the gates being skipped, and the rollback plan.

3. Determine the base. Two cases:

| Case | Base branch |
| --- | --- |
| `main` is the deployed version | Branch from `main` |
| `main` has moved past production | Branch from the deployed tag: `git checkout -b hotfix/<TICKET> service-name/v1.4.2` |

The second case is why release branches exist. Hotfixing from a `main` that contains unreleased changes would deploy those changes too.

### 4.2 Make the change

4. Make the smallest change that fixes the defect. Not the correct architectural fix — that comes later as normal work. A hotfix is a tourniquet.

5. **Write a failing test first**, then make it pass ([23 §23.3](../23-testing-strategy.md), T-7). Under time pressure this feels like a detour and is the only thing preventing the same defect returning in three weeks.

6. Commit with a conventional-commit message referencing the incident:

```bash
git commit -m "fix(grant): reject disbursement when ceiling check overflows

The cumulative total was compared before the new amount was cast to
numeric, so a large value silently passed the ceiling check.

Refs: INC-2026-041"
```

### 4.3 Review and pipeline

7. Open the pull request, marked as a hotfix, and get the second engineer's review. Review scope for a hotfix: does it fix the defect, does it introduce anything else, and is the rollback still safe.

8. Let the pipeline run. Watch which gates pass:

```bash
gh pr checks <PR_NUMBER> --watch
```

**Gates that must pass, no exceptions:**

| Gate | Why non-negotiable |
| --- | --- |
| Secret scan | A leaked secret is worse than the incident |
| Type check and lint | Cheap, and catches the careless mistake |
| Unit tests for the affected module | Including the new failing-then-passing test |
| **Tenant isolation suite** | A cross-tenant leak is catastrophic and irreversible |
| Image build, scan, sign, provenance | An unsigned image will be refused by admission control anyway |
| Migration lock-safety, if a migration is present | A locked table turns one incident into two |

**Gates that may be compressed with authorisation:** the full E2E suite, the staging soak period, the full load profile, and the staged canary progression.

9. If a non-negotiable gate fails, **stop.** Fix it. Do not seek an override; there isn't one.

### 4.4 Staging

10. Merge and let staging deploy:

```bash
argocd app sync ngois-staging-<SERVICE> --prune=false
argocd app wait ngois-staging-<SERVICE> --health --timeout 300
```

11. Verify the fix in staging by reproducing the original defect and confirming it no longer occurs. This is the step people skip, and it is the one that catches a fix that does not actually fix anything.

12. Run the smoke suite:

```bash
npm run test:e2e:smoke -- --env=staging
```

**Expected:** all smoke journeys pass. A failure here means the hotfix broke something else.

13. A compressed soak of 15 minutes minimum, watching staging error rates. Not the normal 2 hours, but not zero either.

### 4.5 Production

14. Deploy through Argo, with compressed canary steps:

```bash
# CI has opened a digest-bump PR. Merge it; do not patch the image by hand.
gh pr merge <DIGEST_PR> --squash

argocd app sync ngois-prod-<SERVICE>
kubectl argo rollouts get rollout <SERVICE> -n <NS> --watch
```

15. Canary progression for a hotfix: 25 per cent for 5 minutes, then 100 per cent. Automated analysis still applies and will still abort on an error-rate or latency breach ([22 §22.5.1](../22-cicd-release-supply-chain.md)) — the analysis is not skipped, only the number of steps is reduced.

16. Watch during the canary:

| Signal | Where | Abort if |
| --- | --- | --- |
| 5xx rate | D-01 | Above 1 per cent or 3× baseline |
| p95 latency | D-01 | Above 1.5× baseline |
| Error log rate | D-02 | Above 5× baseline |
| Pod restarts | D-02 | Any `CrashLoopBackOff` |
| **The original defect** | Whatever surfaced it | Still occurring |
| **Domain metrics** | D-15 | Submissions, disbursements or payroll computations dropping |

17. If the canary aborts, it rolls back automatically. Do not force it through — the analysis is telling you something.

## 5. Verification

18. **The original defect no longer reproduces.** Verify by the same method that surfaced it: the failing user action, the alert, or the tenant's report.
19. Error rate and latency at baseline on D-01.
20. Domain metrics normal on D-15.
21. No new alerts firing.
22. The deployed digest matches the hotfix build:

```bash
kubectl -n <NS> get deploy <SERVICE> \
  -o jsonpath='{.spec.template.spec.containers[0].image}'
argocd app get ngois-prod-<SERVICE> -o json | jq -r '.status.sync.revision'
```

23. Argo reports the application `Synced` and `Healthy` — meaning the cluster matches Git, so nothing will be reverted later.
24. Confirm with the affected tenant, where one reported it. Their confirmation is worth more than a green dashboard.

## 6. Rollback

25. Same as any deployment:

```bash
kubectl argo rollouts undo <SERVICE> -n <NS>
# Or, preferably, revert the digest commit so Git remains the source of truth.
git revert <DIGEST_COMMIT> && git push
```

26. If the hotfix included a migration, **roll back the code only.** The migration is backward-compatible by construction and is not reversed ([22 §22.5.3](../22-cicd-release-supply-chain.md)).

## 7. Escalation

| Condition | Escalate to |
| --- | --- |
| A non-negotiable gate fails | Platform Lead. There is no override |
| The hotfix does not fix the defect | Chief Architect. Reassess the diagnosis; do not iterate hotfixes under pressure |
| The canary aborts twice | Chief Architect. Roll back and consider the kill-switch option instead |
| The fix requires a schema migration | Data Architect **must** review, regardless of urgency |
| The fix touches authorisation, cryptography, RLS or payroll | Security Lead or Data Architect review is mandatory, not optional |
| More than two hotfixes in a month | Chief Architect — this indicates a quality problem upstream ([22 §22.10](../22-cicd-release-supply-chain.md)) |

## 8. Follow-up

Within 24 hours:

- **Run the full pipeline against the change**, including everything that was compressed. Address anything it would have failed.
- Forward-port the fix to `main` if the hotfix was made from a release branch. **A hotfix that is not forward-ported will be undone by the next release**, which is a genuinely maddening class of recurrence.
- Replace the tourniquet with the correct fix if the hotfix was a minimal workaround.
- Postmortem covering both the defect and why it reached production.
- Review whether a kill switch should exist for this subsystem — if one had, the hotfix might not have been needed.
- Record the hotfix in the emergency change register and count it against the monthly limit.
