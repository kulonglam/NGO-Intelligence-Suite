# ADR-0013 — A Progressive Web App rather than Native Mobile Applications

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-04-20 |
| **Deciders** | Chief Architect, Product, Executive Director |
| **Consulted** | Field squad lead, two design-partner field coordinators |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [13](../13-offline-first-architecture.md), [ADR-0020](0020-vue-3-frontend-stack.md) |

---

## Context

Field officers capture beneficiary registrations, assessments and distributions on personal or programme-issued Android devices, frequently mid-range with 2 GB of RAM, on 2G or no connectivity, for up to 72 hours between syncs ([13 §13.8](../13-offline-first-architecture.md)).

Office users — finance, HR, programme management — work on desktops with connectivity.

The client question is whether the field experience justifies one or two native applications alongside the web application.

Two contextual facts shaped the answer more than any technical comparison:

**App store updates require bandwidth these devices do not reliably have.** An APK update is tens of megabytes; a service worker update is a few hundred kilobytes. A fleet of devices that syncs weekly over 2G will drift far behind on native versions, and a security fix that cannot be delivered is not a fix.

**Programme-issued devices are frequently not managed, and personal devices are common.** There is no MDM to push an APK to, and asking a field officer to install from a store account they may not have, over connectivity they do not have, is a support problem that dwarfs any UX benefit.

## Decision

**A single Vue 3 Progressive Web App for all users, installable to the home screen, with offline capability built on IndexedDB and a service worker.**

| Requirement | How the PWA meets it |
| --- | --- |
| 72-hour offline capture | IndexedDB with an encrypted local store, quota-managed |
| Instant perceived submission | Local write then background sync; under 200 ms perceived ([30 PE-03](../30-quality-attributes-nfr.md)) |
| Resumable sync on 2G | Chunked batches with idempotency keys, resumable at any boundary |
| Data safety at rest | Local encryption with a key derived from the session; remote wipe on device revocation |
| Installability | Web app manifest; home-screen icon indistinguishable from an app to the user |
| Small updates | Service worker update, a few hundred kilobytes |
| Photograph capture | `getUserMedia` and file input, compressed client-side before storage |
| Location capture | Geolocation API |

## Alternatives considered

**Native Android** (with iOS deferred). Better offline primitives, guaranteed background sync, direct filesystem and hardware access, and better performance on low-end devices. Rejected on the update and distribution problem above, which is decisive rather than marginal, plus a second codebase to build and maintain with skills the team does not have, and app-store review latency on a fix that field teams need this week.

**React Native or Flutter**, one codebase for both platforms. Rejected: still an app-store distribution and update problem, still a second technology stack for a team of this size, and the web application would exist anyway for office users, so it is a second codebase regardless.

**A hybrid wrapper — Capacitor around the same web code.** The most tempting middle path, and the closest call. It would give the same codebase plus better background sync and filesystem access. Rejected for now, not on principle: it reintroduces app-store distribution and updates, which is the primary problem, in exchange for capabilities the 72-hour budget does not require. **This is the option to revisit first** if a genuine native capability becomes necessary, because it is an incremental step from where we are rather than a rewrite.

**SMS-based capture for the field.** Rejected as a primary mechanism: unusable for structured multi-field forms with photographs. Retained as a narrow fallback for a few critical notifications and confirmations ([27 §27.8](../27-disaster-recovery-and-bcp.md)).

**Paper capture with office data entry.** Rejected as the primary path, and deliberately retained as the documented continuity fallback for an outage beyond seven days. The pragmatic reality is that paper works when nothing else does.

## Consequences

**Positive.** One codebase, one deployment, one test suite, one set of skills. Updates are small and arrive on the next successful load, which means a security fix reaches a device the first time it has signal. No app store, no review latency, no installation support burden. Nothing to install for a new officer beyond opening a URL — which in a context with high staff turnover ([32](../32-risk-register.md) R-44) is a material operational benefit.

**Negative, and each needed explicit design work.** Storage is subject to browser quota and eviction, so quota monitoring and a warning threshold were required rather than optional. Background sync is not guaranteed on all platforms — notably iOS Safari — so sync is foreground-triggered with a clear UI state rather than assumed to happen invisibly. No access to platform-level device management or attestation. Performance on a 2 GB device required real budgets and enforcement ([19 §19.8](../19-frontend-architecture.md)) rather than being comfortable. Local encryption is JavaScript-based via WebCrypto, which is sound but keyed from the session rather than from a hardware-backed keystore — a weaker position than a native app could achieve, and the residual risk is accepted and documented against [32](../32-risk-register.md) R-40.

**Where this decision is weakest.** Device seizure ([32](../32-risk-register.md) R-40, exposure 15) is the risk a native app with hardware-backed keys would handle better. The mitigation — encryption at rest, minimal local caching, short retention, remote wipe — is adequate but not equal. If field seizure incidents occur, revisiting this via a Capacitor wrapper with a hardware-backed keystore is the first response, and that path is deliberately kept open.
