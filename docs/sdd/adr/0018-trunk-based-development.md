# ADR-0018 — Trunk-Based Development with Release Flags

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-05-04 |
| **Deciders** | Chief Architect, Platform Lead |
| **Consulted** | All squad leads |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [22](../22-cicd-release-supply-chain.md), [20 §20.5](../20-configuration-secrets-feature-flags.md) |

---

## Context

Three squads work on fifteen services in one repository. The branching model determines how often integration pain is felt and in what size.

The relevant properties of the situation: services are independently deployable ([ADR-0001](0001-microservices-over-modular-monolith.md)), database migrations must be backward-compatible so that rollback is always available ([22 §22.6](../22-cicd-release-supply-chain.md)), and rollback within five minutes is a stated requirement ([30 RE-13](../30-quality-attributes-nfr.md)).

That last point interacts with branching more than it first appears. A rollback is only fast if `main` is always deployable and the change being rolled back is small.

## Decision

**Trunk-based development: short-lived branches from `main`, squash-merged within two working days, no long-lived branches. Incomplete work is hidden behind release flags, not held on a branch.**

| Rule | Detail |
| --- | --- |
| Branch lifetime | Two working days. Longer requires a stated reason |
| Pull request size | Under 400 changed lines ([35 §35.3.1](../35-engineering-standards.md)) |
| Merge | Squash, so `main` history is one commit per change |
| `main` is always deployable | Every commit passes every gate |
| Incomplete features | Behind a release flag with a recorded removal date |
| Versioning | Semantic, derived from Conventional Commits |
| Release branches | **None**, except a `hotfix/*` branch cut from the deployed tag ([RB-10](../runbooks/rb-10-hotfix-deployment.md)) |
| Flag debt | No release flag more than 90 days past its removal date; CI fails otherwise |

Deployment is decoupled from merge: merging to `main` produces a signed artefact that is promoted through staging to production by canary. A merge is not a release.

## Alternatives considered

**GitFlow**, with `develop`, `release/*` and `feature/*` branches. Rejected. It was designed for versioned software with scheduled releases and long-lived support versions, which describes almost nothing about this platform. Concretely, it would mean long-lived feature branches diverging for weeks, a `develop` branch whose deployability is uncertain, painful periodic merges, and a rollback story that requires reasoning about which branch a change came from. With three squads in one repository, the merge conflicts alone would be a recurring tax.

**GitHub Flow with long-lived feature branches.** Simpler than GitFlow and the most common alternative in practice. Rejected on integration cost: a two-week feature branch across three squads touching shared packages produces exactly the large, risky merge that trunk-based development exists to avoid. It also makes the 400-line review target unattainable, and review quality is the strongest available defect filter.

**Release branches with cherry-picking.** Rejected: cherry-picking is a reliable source of "fixed in one branch, not the other" defects, and it requires someone to track what has been forward-ported. The hotfix procedure explicitly requires forward-porting as a follow-up step for the one case where a hotfix branch is unavoidable.

**Trunk-based with no flags**, relying on small changes only. Considered, and it works for most changes. Rejected as a general rule because some changes genuinely cannot be shipped in a two-day increment — a payroll calculation path or a sync protocol change needs to land incomplete and inert. Flags are the mechanism for that, with the debt controls above to stop them accumulating.

## Consequences

**Positive.** Integration happens continuously in small pieces, so there is no integration phase to be surprised by. `main` is always deployable, which is what makes a five-minute rollback real rather than aspirational. Review stays within the size where it detects defects. Lead time from commit to production is under an hour ([22 §22.10](../22-cicd-release-supply-chain.md)). Semantic versioning and changelogs are derived rather than curated. Flags double as kill switches, which is directly useful during an incident — [RB-08](../runbooks/rb-08-scale-event.md) and [RB-15](../runbooks/rb-15-integration-failure.md) both rely on disabling behaviour without a deployment.

**Negative.** It requires discipline that a branching model would otherwise enforce: every commit on `main` must pass every gate, so the pipeline has to be fast enough that people do not resent it, which is why the 12-minute pull request feedback target is a requirement rather than a preference. Feature flags are complexity and a source of untested code path combinations, mitigated by testing both states of any flag on a critical path and by the 90-day debt rule. Incomplete code is in production, inert, which requires trust in the flag mechanism itself. There is no release branch to stabilise, so a problem found late is fixed forward or rolled back rather than held.

**Where it depends on something else being true.** Trunk-based development is only safe because every migration is backward-compatible by rule. If a migration were ever merged that made rollback impossible, `main` would stop being deployable in the sense that matters, and the whole model would quietly stop working. That is why migration lock-safety and expand-contract compliance are automated gates rather than review conventions.
