# 35 — Engineering Standards and Ways of Working

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Chapter:** 35 — Engineering Standards and Ways of Working
> **Owner:** Chief Architect
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Review Cadence:** Quarterly
> **Related ADRs:** [ADR-0007](adr/0007-typescript-on-node20.md)

---

## 35.1 What standards are for

A standard earns its place by removing a decision that does not need making, or by preventing a defect class. Anything else is preference dressed as policy, and it should be a lint rule or nothing at all.

Three properties of a good standard here:

**It is enforced automatically wherever possible.** A standard that relies on a reviewer remembering it will be followed unevenly and then resented.

**It says why.** A rule without a rationale gets cargo-culted into situations it does not fit, and nobody can tell when it has stopped applying.

**It is small enough to be read.** This chapter is the whole of the standards. There is no second document.

---

## 35.2 Code ownership

`CODEOWNERS` maps every path to a squad, and a pull request requires approval from at least one owner. Four paths carry an additional owner because a mistake in them is disproportionately expensive.

| Path | Owner | Additional required approval |
| --- | --- | --- |
| `services/*/` | The owning squad | — |
| `packages/tenant-context/` | Platform | **Data Architect** — the `SET LOCAL` defect class |
| `packages/crypto/` | Platform | **Security Lead** |
| `services/hr-payroll-service/payroll/` | Workforce | **Data Architect** — statutory correctness |
| `services/ai-insights/redaction/` | Platform | **Security Lead** |
| `migrations/` | The owning squad | **Data Architect** |
| `infra/`, `deploy/` | Platform | — |
| `.github/workflows/` | Platform | **Security Lead** for anything touching a gate |
| `docs/sdd/` | The chapter owner | Chief Architect for structural change |

No service has a single owner. A single-owner service becomes an unreviewable service the moment that person is on leave, and [32](32-risk-register.md) R-32 scores key-person dependency at 12 for exactly this reason.

---

## 35.3 Code review

### 35.3.1 Expectations

| | |
| --- | --- |
| Minimum approvals | 1 owner; 2 for the paths above |
| Target first response | 4 working hours |
| Target pull request size | Under 400 changed lines. Larger requires a stated reason |
| Author's responsibility | A description covering what changed, why, and how it was verified. A reviewer should not have to reconstruct intent from a diff |
| Self-merge | Not permitted, including for the Chief Architect |
| Stale approval | Invalidated by a new commit |

The size target is the standard with the largest measurable effect on defect detection. Review quality falls off sharply past a few hundred lines, and a 2,000-line pull request receives approval rather than review.

### 35.3.2 What a reviewer is responsible for

In order. A reviewer who spends their attention on naming and misses a missing tenant filter has reviewed nothing.

| Priority | Question |
| --- | --- |
| 1 | **Is tenant scoping correct?** Is context set with `SET LOCAL`? Are Redis keys and object paths prefixed? |
| 2 | **Is authorisation correct?** Is the permission check present and is it the right permission? |
| 3 | **Is personal data handled correctly?** Encrypted, purpose-logged, classified, absent from logs and traces? |
| 4 | **Is the money arithmetic exact?** `NUMERIC`, currency-carrying, no floating point? |
| 5 | Are the tests meaningful, and would they fail if the code were wrong? |
| 6 | Are errors handled with actionable messages and error codes? |
| 7 | Is there observability — metrics, structured logs, spans? |
| 8 | Is the audit entry emitted for every mutation? |
| 9 | Is the query pattern sound? Any N+1, missing index, unbounded result set? |
| 10 | Is it readable by someone who was not in the conversation? |

### 35.3.3 Review conduct

Comments address the code, not the author. A blocking objection states what would resolve it. A preference is labelled as one — "nit:" — and does not block. If two people disagree twice, they discuss it rather than continuing in comments, and if they still disagree the Chief Architect decides. A review thread with fifteen replies has stopped being a review.

An approval means "I would be comfortable being paged for this." That framing is deliberate, because the people reviewing are the people on call.

---

## 35.4 Code standards

### 35.4.1 Enforced automatically

| Standard | Tool | Failure |
| --- | --- | --- |
| TypeScript `strict`; no `any` in domain code | `tsc`, ESLint | Build fails |
| Formatting | Prettier | Build fails |
| Lint rules including the custom set | ESLint | Build fails |
| **`SET` without `LOCAL`** | Semgrep | **Build fails** |
| **A raw SQL query on a tenant-owned table without tenant context** | Semgrep | **Build fails** |
| **`process.env` read outside the config schema** | ESLint | Build fails |
| Floating-point arithmetic in a money path | Semgrep | Build fails |
| Cross-module import in the frontend | ESLint boundaries | Build fails |
| A logger call with a known PII field name | Semgrep | Build fails |
| Secret patterns | gitleaks | Build fails |
| Coverage floors | Jest | Build fails |
| Commit message format | commitlint | Commit rejected |
| Migration lock safety | Custom check | Build fails |
| An alert without a runbook | Custom check | Build fails |
| A flag past its removal date | Custom check | Build fails |

Fifteen automated gates, of which five exist specifically to prevent a tenant-isolation or PII defect. Those five are never bypassable, including during an incident hotfix ([RB-10](runbooks/rb-10-hotfix-deployment.md)).

### 35.4.2 Conventions requiring judgement

| Area | Convention |
| --- | --- |
| Naming | Descriptive over short. `disbursementCeilingRemaining`, not `dcr`. Booleans read as assertions: `isApproved`, `hasUnsyncedData` |
| Functions | One responsibility. If the name needs "and", it is two functions |
| Errors | Typed domain errors with a code from the taxonomy. Never a bare `throw new Error(string)` in domain code |
| Nulls | Explicit. No coercion of an absent value to a default that changes meaning — a missing tax band is an error, not zero |
| Async | `async`/`await` throughout. No mixed promise chains |
| Transactions | As short as possible. **No external call inside a transaction**, ever — an HTTP request holding a database transaction open is how a pool gets exhausted |
| Dates and times | UTC in storage, `timestamptz` always. `captured_at` and `received_at` are distinct and both preserved |
| Comments | Explain why, not what. A comment restating the code is deleted in review |
| Dead code | Deleted, not commented out. Git remembers |
| TODO | Requires a ticket reference or it does not merge |

### 35.4.3 Commits and branches

Trunk-based: short-lived branches from `main`, merged by squash, no long-lived feature branches. Conventional Commits, because the changelog and the version bump are derived from them.

```
feat(payroll): add Uganda LST calculation
fix(sync): preserve captured_at when device clock is skewed
chore(deps): bump express to 4.19.2
docs(sdd): revise chapter 29 isolation layers
```

A commit that touches production behaviour references its ticket. A revert states what it reverts and why.

---

## 35.5 Architecture Decision Records

### 35.5.1 When an ADR is required

An ADR is required when a decision is expensive to reverse, or when a future engineer would reasonably ask "why on earth is it done this way".

| Requires an ADR | Does not |
| --- | --- |
| Choosing or replacing a data store, broker or provider | Adding a table to an existing schema |
| Changing the isolation model | Adding a column |
| A new cross-cutting pattern | Applying an existing pattern |
| Accepting a significant trade-off, especially a security or privacy one | A local refactor |
| Deliberately deviating from a principle in [04](04-architecture-principles.md) | Following one |
| Adding recurring cost above 200 a month | A one-off cost |
| Any decision the team argued about for more than an hour | A decision nobody contested |

The last row is the most reliable heuristic in practice. If a decision generated real disagreement, the reasoning is worth recording, because the disagreement will recur.

### 35.5.2 Format and lifecycle

Context, Decision, Alternatives Considered, Consequences, Status. The two sections that carry the value:

**Alternatives Considered** must state why each was rejected, specifically. "We considered Kafka but chose Redis Streams" is worthless; "Kafka's operational burden — Zookeeper or KRaft, partition rebalancing, broker upgrades — is not justifiable for a five-person platform capability at our throughput" is what a future reader needs.

**Consequences** must include the negative ones. An ADR listing only benefits is marketing, and it will not help the person who later discovers the downside the hard way.

Status moves `Proposed → Accepted → Superseded` or `Deprecated`. **An ADR is never edited after acceptance and never deleted.** A superseded decision is superseded by a new ADR that references it, because the record of what was believed and why is the entire point.

---

## 35.6 API design review

Any new endpoint, any change to an existing contract, and any new event schema goes through a design review **before implementation**. A contract discovered to be wrong after clients depend on it is a versioning problem rather than a fix.

The review is asynchronous by default: a short proposal with the path, method, request and response shapes, permission, and error cases, reviewed by the Chief Architect plus one engineer from a consuming squad. Turnaround target is one working day.

| Checked | |
| --- | --- |
| Conforms to the standards in [10](10-api-design-standards.md) — envelope, status codes, pagination, filtering |
| The resource model is a noun, and the operation is expressed by the method |
| Permission named and added to the matrix |
| Idempotency where the operation is not naturally idempotent |
| Concurrency control where lost updates matter |
| Pagination on anything that can return more than one page, with a bounded page size |
| No personal data in a URL path or query string — it lands in logs |
| Error cases enumerated with codes from the taxonomy |
| Response shape is additive-compatible with plausible future fields |
| Rate-limit tier assigned |
| For an event: naming, envelope, versioning, and whether a consumer at version N tolerates N+1 |

---

## 35.7 Documentation

| Artefact | Rule |
| --- | --- |
| **This SDD** | Updated in the same pull request as the change it describes. A behaviour change with a stale chapter is an incomplete change |
| ADRs | Written before the decision is implemented |
| Runbooks | Written before the capability reaches production, and corrected the same day after any use |
| API reference | Generated from the implementation; drift is a build failure |
| `README` per service | Purpose, dependencies, how to run it locally, how to run its tests |
| Code comments | Only for non-obvious intent, constraint or trade-off |
| Chapter review dates | A governed field. Nothing goes over 12 months unreviewed ([MA-11](30-quality-attributes-nfr.md)) |

The first row is the standard that most often gets deferred and most reliably causes harm. A document that is 80 per cent current is worse than one known to be a year old, because nobody can tell which 20 per cent is lying.

### 35.7.1 The SDD is linted like code

Eleven checks run on every pull request touching `docs/sdd/`, and a failure in any of the nine blocking ones stops the merge exactly as a failing unit test would ([tools/](tools/README.md)). They verify that every internal link resolves, every `§` cross-reference names a heading that exists, every identifier is defined before it is referenced, every file is reachable from the index, every diagram parses, every summary count matches the table it summarises, and that service names, ports and metric names are identical in every chapter that mentions them.

This is deliberately narrow. The checks prove **referential integrity, not correctness** — a link can resolve to a chapter that says the wrong thing, and no script can tell that a port documented consistently in two chapters matches the deployed Helm chart. What they do is remove the failure mode where a rename lands in one chapter and eleven others quietly become wrong, which is the way large document sets actually rot.

Two checks are advisory rather than blocking because they have a short list of legitimate findings: deliberate counter-examples in the prose, and Kubernetes resource kinds that look like alert names. The list is enumerated in the tooling README, and anything not on it is a real defect. The reason to keep a reviewed list rather than tune the regex until it goes green is that a check nobody trusts is worse than no check.

---

## 35.8 Definition of done

The full fifteen-item list is in [31 §31.8.1](31-implementation-roadmap.md) and is not restated here, because two copies of a checklist means one of them is out of date.

The short form, for the pull request template: **tests, tenant scoping, authorisation, audit, observability, accessibility, docs, reviewed by someone else.**

---

## 35.9 Ways of working

| Practice | Detail |
| --- | --- |
| Squad cadence | Two-week iterations; planning at the start, a short review and retrospective at the end |
| Daily sync | 15 minutes, blockers only. Not a status report |
| Architecture Guild | Fortnightly, 60 minutes: ADRs, API reviews, cross-squad concerns, the tech radar |
| Incident review | Weekly, 30 minutes: incidents, alert noise, toil, error budget position |
| FinOps review | Monthly ([33 §33.8.1](33-cost-model-and-finops.md)) |
| Risk review | Monthly for High and above ([32 §32.8.1](32-risk-register.md)) |
| Security review | Monthly: advisories, scan findings, threat model changes, break-glass usage |
| Pairing | Expected on payroll, isolation, encryption and redaction work. Not mandated elsewhere |
| Postmortems | Blameless, within 5 working days of any SEV-1 or SEV-2 ([26 §26.6](26-reliability-and-incident-management.md)) |
| **Time on platform work** | **35 per cent of engineering capacity, protected** ([31 §31.1](31-implementation-roadmap.md)) |
| Toil ceiling | 20 per cent. Above it, automation takes priority over features |
| On-call | Documented in [26 §26.3](26-reliability-and-incident-management.md), with its constraints stated honestly |

### 35.9.1 The two numbers that matter

The 35 per cent platform allocation and the 20 per cent toil ceiling are the operational core of this chapter. They are also the two most likely to be quietly eroded, and their erosion is invisible until a gate fails or an on-call rotation becomes unbearable.

Both are reported monthly with actuals. Reporting them is the mechanism; without a number on a dashboard, "we're protecting platform time" is an intention rather than a practice.

---

## 35.10 Tech radar

Reviewed quarterly by the Architecture Guild.

| Ring | Meaning |
| --- | --- |
| **Adopt** | The default. Use it without discussion |
| **Trial** | Approved for a bounded, low-risk use with a named owner and a review date |
| **Assess** | Worth understanding. Not for production |
| **Hold** | Not to be introduced. Existing use is to be reduced |

| Technology | Ring | Note |
| --- | --- | --- |
| TypeScript, Node.js LTS | Adopt | [ADR-0007](adr/0007-typescript-on-node20.md) |
| PostgreSQL | Adopt | The default for anything relational, and for most things that seem not to be |
| Redis — cache and Streams | Adopt | [ADR-0003](adr/0003-redis-streams-over-kafka.md) |
| Vue 3, Pinia, TanStack Query, Tailwind | Adopt | |
| Kubernetes, Helm, Argo CD, Terraform | Adopt | |
| Prometheus, Grafana, Loki, OpenTelemetry, Tempo | Adopt | |
| Jest, Playwright, Testcontainers, Pact, k6 | Adopt | |
| Zod | Adopt | Config and boundary validation |
| Argo Rollouts | Trial | Canary from Phase 2 |
| eBPF-based runtime security | Assess | Attractive; no capacity to operate it yet |
| A service mesh | **Hold** | Operational cost exceeds benefit at fifteen services ([21 §21.1](21-deployment-and-infrastructure.md)). mTLS is achieved without one |
| Kafka | **Hold** | [ADR-0003](adr/0003-redis-streams-over-kafka.md) |
| GraphQL | **Hold** | Would fragment the API standard and complicate per-field authorisation |
| An ORM with implicit lazy loading | **Hold** | The N+1 defect class is too easy to introduce invisibly |
| Any NoSQL store as a primary | **Hold** | No requirement justifies giving up relational constraints on data this consequential |
| MongoDB | Hold | As above |
| Serverless functions for domain logic | Hold | Cold starts, harder observability, and no fit with the tenant context model |
| A new language in the backend | **Hold** | A second runtime doubles the supply-chain, patching and on-call surface for a five-person platform capability |

The Hold list is longer than the Trial list, and that is the intended shape. At this team size, the cost of a technology is dominated by the cost of operating it at three in the morning, and every addition is paid for by the same five people.
