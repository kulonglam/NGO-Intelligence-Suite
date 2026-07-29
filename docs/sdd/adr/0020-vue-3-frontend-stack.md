# ADR-0020 — Vue 3 with Pinia, TanStack Query and Tailwind

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-04-20 |
| **Deciders** | Frontend Lead, Chief Architect |
| **Consulted** | Design, Field squad lead |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [19](../19-frontend-architecture.md), [ADR-0013](0013-pwa-over-native-mobile.md) |

---

## Context

One frontend serves two quite different populations: office users on desktops with connectivity, and field officers on mid-range Android devices with 2 GB of RAM, on 2G or no connectivity, needing full offline capture ([ADR-0013](0013-pwa-over-native-mobile.md)).

The constraints that actually decided this, rather than the usual framework comparison:

| Constraint | Consequence |
| --- | --- |
| 180 KB gzipped initial bundle ([30 PE-08](../30-quality-attributes-nfr.md)) | Runtime size is a first-order concern, not a footnote |
| LCP under 3 s on a mid-range Android over 3G | Parse and hydration cost matters |
| Three languages including Arabic, with full RTL ([30 US-03](../30-quality-attributes-nfr.md)) | The i18n and RTL story must be mature, not a plugin experiment |
| WCAG 2.1 AA on every journey | Accessible component primitives needed |
| A small team, no dedicated frontend platform capability | Framework learning curve is a real cost |
| TypeScript end to end ([ADR-0007](0007-typescript-on-node20.md)) | Type sharing with the backend must work well |

## Decision

**Vue 3 with the Composition API and `<script setup>`, TypeScript, Pinia for client state, TanStack Query for server state, Tailwind CSS for styling, Vite for the build, Vitest and Playwright for tests.**

The state split is the part worth stating explicitly, because conflating the two is the most common cause of frontend complexity:

| State | Owner | Examples |
| --- | --- | --- |
| **Server state** | TanStack Query | Anything fetched: lists, records, dashboards. Caching, staleness and refetch are its job, not ours |
| **Client state** | Pinia | Session, active tenant, UI preferences, offline queue status, form drafts |
| **Offline data** | IndexedDB via a dedicated layer | Captured submissions, cached reference data, local encryption |

No fetched data is copied into Pinia. That single rule removes most of the cache-invalidation logic a hand-rolled store would need.

## Alternatives considered

**React.** The largest ecosystem, the deepest hiring pool, and the safest choice by convention. Rejected on three margins that all pointed the same way. Runtime size is larger for equivalent functionality once a router and a state library are added, and the 180 KB budget is tight. More significantly, React's model puts more of the performance burden on the developer — memoisation, dependency arrays, re-render discipline — and getting that consistently right on 2 GB devices with a small team is a recurring cost, where Vue's reactivity does more of it by default. Third, the team's existing depth was in Vue, and a learning curve during a sixteen-month build with statutory payroll in it is not a cost worth taking for ecosystem breadth we do not need.

**Svelte or SvelteKit.** The best answer on bundle size and runtime performance, which are two of the top constraints, and it was a genuine contender. Rejected on ecosystem maturity for the specific things this platform needs most: accessible component primitives, i18n with robust RTL and bidirectional text handling, and PWA tooling. Those are exactly the areas where a thinner ecosystem costs the most, because they are hard to get right from scratch and unforgiving when wrong.

**Angular.** Comprehensive, batteries-included, strong TypeScript integration, and good i18n. Rejected on bundle size and on framework weight relative to team size; the structure it imposes would be more valuable on a much larger team.

**Server-rendered pages with progressive enhancement.** Attractive for first-load performance and simplicity. Rejected because it is fundamentally incompatible with the offline requirement: field capture needs a client-side application that functions with no server at all for 72 hours.

**Nuxt** for SSR on top of Vue. Rejected: SSR adds a server-side rendering tier and complexity for a mostly-authenticated application where first-paint on a public page is not a requirement, and it complicates the offline-first service worker story.

**A separate field application** from the office application. Considered seriously, since the two populations differ so much. Rejected: two codebases, two test suites and two deployments for a team this size, with substantial shared domain logic — forms, validation, entity models — that would need to be shared or duplicated. Route-level code splitting achieves most of the benefit, since a field officer never loads the payroll bundle.

## Consequences

**Positive.** Small runtime, which is what makes the bundle budget achievable. Reactivity that performs well on low-end devices without per-component optimisation discipline. Mature i18n with genuine RTL support, which for Arabic including bidirectional text is not something to improvise. Excellent TypeScript support with the Composition API, and types shared with the backend so an API change surfaces as a compile error. Tailwind gives design system tokens including logical properties, which is what makes RTL a matter of `ps-4` rather than a mirrored stylesheet. TanStack Query removes the entire class of hand-written cache invalidation bugs. Vite makes the build fast enough that nobody works around it.

**Negative.** A smaller ecosystem and hiring pool than React, which is a real risk for a small team and is part of why key-person dependency is scored at 12 in [32](../32-risk-register.md) R-32. Fewer off-the-shelf accessible component libraries than React, so several primitives are built in-house and carry their own accessibility test burden. Tailwind produces verbose markup, which reviewers find noisier than semantic classes. The Pinia and TanStack Query split is a rule that must be taught and enforced in review, because the natural instinct is to put fetched data in the store. And offline capability is not something the framework provides — IndexedDB, the sync layer, local encryption and conflict handling are all bespoke, and constitute the bulk of the frontend's genuine complexity ([13](../13-offline-first-architecture.md)).
