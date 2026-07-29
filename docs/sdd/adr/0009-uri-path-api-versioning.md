# ADR-0009 — Major API Version in the URI Path

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-04-28 |
| **Deciders** | Chief Architect |
| **Consulted** | Frontend Lead, Field squad lead, Support Lead |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [10 §10.11](../10-api-design-standards.md) |

---

## Context

The API has clients the platform does not control the update cycle of. A field PWA on a device that syncs weekly over 2G may run code that is months old — service worker updates need a successful fetch and enough bandwidth, and a device that is rarely online is rarely updated. Tenants will also build their own integrations.

So a versioning scheme is needed, and the decision is which mechanism.

The population of clients is the deciding context, not the theoretical purity of the options. The question is not "which is most RESTful" but "which is easiest to diagnose when a field officer in Bentiu reports something odd and the only evidence is a log line."

## Decision

**Major version as the first path segment: `/api/v1/beneficiaries`.**

| Rule | |
| --- | --- |
| Only breaking changes increment the major version | Additive changes — a new optional field, a new endpoint, a new enum value a client can ignore — never do |
| At most two major versions live at once | More than two is an unmanageable test matrix for this team |
| Deprecation announced 6 months ahead | With `Deprecation` and `Sunset` headers on every response from the deprecated version |
| Minor evolution communicated by release notes | Not by a version identifier |
| Every response carries the serving version | In a header, so it appears in client-side error reports |

Breaking is defined explicitly in [10 §10.11](../10-api-design-standards.md): removing or renaming a field, changing a type, adding a required request field, changing an error code's meaning, or tightening validation on an existing field.

## Alternatives considered

**A custom header, `X-API-Version: 1`.** The cleaner answer by REST orthodoxy, since a resource's identity does not change with representation. Rejected on operational grounds. A version in a header is invisible in an access log unless deliberately captured, invisible in a browser address bar, absent from a URL a support engineer can paste into a terminal, and not part of a CDN cache key without explicit `Vary` configuration. Every one of those costs is paid during an incident, and the benefit is theoretical.

**Content negotiation via `Accept: application/vnd.ngois.v1+json`.** The most correct option by the specification and the least usable in practice. It is hard to exercise with `curl` without care, hard for a tenant's integration developer to get right on the first attempt, and shares every diagnostic weakness of the header approach.

**A query parameter, `?version=1`.** Rejected: easily lost through redirects and link-copying, awkward for caching, and it mixes protocol concerns into the resource query.

**No versioning; only additive change, forever.** Genuinely considered, because with strict additive discipline it can work for a long time. Rejected because it forecloses the ability to fix a genuine modelling mistake, and over a sixteen-month build followed by years of operation, at least one will need fixing. An unfixable early error is a worse outcome than a version prefix.

**Per-service versioning**, so each service versions independently. Rejected: from a client's perspective there is one API behind one gateway, and asking a tenant's integration to track fifteen version numbers would be indefensible.

## Consequences

**Positive.** The version is visible everywhere it is useful: logs, traces, dashboards, error reports, support tickets, and a URL that can be pasted. Routing at the gateway is trivial. A client's version is evident from a single log line, which shortens diagnosis of a field-reported problem considerably — and [RB-16 §6.4](../runbooks/rb-16-sync-failure.md) depends on exactly that ability to compare behaviour across client versions. Caching works without `Vary` complications. A tenant's integration developer gets it right without reading documentation carefully.

**Negative.** It is not strictly RESTful, since the same resource has two URIs across versions. Two live versions mean two code paths in the gateway and, briefly, two sets of contract tests. A major version bump touches every client URL, which is why the bar for one is high. There is a mild temptation to treat the version as a dumping ground for change — countered by the rule that only breaking changes increment it, enforced in API design review.

**The commitment that matters.** Six months of overlap with `Deprecation` and `Sunset` headers is a promise to field clients specifically. A device that has been offline for two months should not find itself unable to sync because a version was retired on a schedule set by our convenience. If anything, six months is the minimum, and a longer overlap would be considered before a shorter one.
