# ADR-0010 — Anthropic Claude as LLM Provider, with Hard Boundaries

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-05-30 |
| **Deciders** | Chief Architect, Security Lead, DPO, Executive Director |
| **Consulted** | Product, two design-partner programme managers |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [18](../18-ai-llm-architecture.md), [ADR-0015](0015-application-layer-pii-encryption.md) |

---

## Context

Grant narrative drafting is genuinely time-consuming for the programme staff of a small NGO, and it is the kind of writing a language model does adequately. Anomaly explanation and report summarisation are similar. There is a real efficiency case.

There is also a real hazard case, and it is not the usual one. The concern is not primarily that the model will be wrong — a human reviews the output. It is that:

1. Sending beneficiary data to a third-party API is an egress of personal data about people in conflict settings to a processor outside our control, and
2. A model that confidently invents a figure in a donor report creates a false statement in an accountability document, and
3. A model applied to decisions about people — eligibility, vulnerability, targeting — would launder an unexplainable judgement into a programme outcome.

Two decisions were therefore needed together: which provider, and what the model is categorically not allowed to do.

## Decision

**Anthropic Claude via the API, with five non-negotiable boundaries.**

### The boundaries

| # | Rule |
| --- | --- |
| **AI-1** | **No personal data leaves the platform.** The service reads only k-anonymous aggregate views; a classification gate rejects anything above Internal; a redaction pipeline with second-pass verification runs before egress; a verification failure rejects the request rather than proceeding |
| **AI-2** | **Output is always a draft.** It is persisted as a draft, never as a final record, and is visually distinct until a named human approves it |
| **AI-3** | **No AI decision about a person.** No model output may write to any eligibility, scoring, targeting or entitlement field. This is prohibited, not deferred |
| **AI-4** | **Every figure is checked.** Numbers in output are cross-checked against source aggregates; an unverifiable figure is flagged, not published |
| **AI-5** | **A tenant may disable it entirely**, with no loss of any workflow. Every AI-assisted task has a complete manual path |

### The provider

Selected for: enterprise terms that do not train on API inputs, a documented data retention position, strong instruction adherence on constrained tasks (which matters for AI-4 and for injection resistance), and adequate performance on the drafting tasks in the evaluation harness.

Access is through an explicit egress allow-list; only `ai-insights-service` and `integration-service` can reach the internet at all ([21 §21.5.1](../21-deployment-and-infrastructure.md)).

## Alternatives considered

**No LLM at all.** The safest option and a serious candidate. Rejected because the efficiency benefit for small programme teams is genuine and the boundaries above reduce the residual risk to a level the DPO accepted. Worth noting that the decision would be different without AI-1: if the feature required sending beneficiary data to a third party, the answer would be no.

**OpenAI.** Comparable capability and lower cost per token. Rejected on the data-handling terms available at the time of assessment and on instruction adherence in the injection test corpus, where the margin mattered more than the price. This is a close call and one that could reasonably be revisited; the provider abstraction exists for that reason.

**A self-hosted open-weight model.** The strongest privacy position, since nothing leaves the cluster, and it was the option the security analysis preferred initially. Rejected on operational cost: GPU nodes at roughly 700–1,500 a month for capacity that would sit idle most of the time, plus model serving to operate and evaluate, against a five-person platform capability. Reassessed annually — if inference cost falls or a tenant requires no third-party processing at all, this becomes the likely answer.

**A cloud provider's managed model service.** Would keep data within one vendor relationship and possibly one region. Rejected on capability for the drafting task and on the weaker data-handling commitments in the terms reviewed.

**Allowing the model to read record-level data with redaction only.** Rejected. Redaction is a control that can fail; aggregate-only access is a constraint that cannot. Restricting the service to small k-anonymous views bounds both the privacy exposure and, incidentally, the token cost ([33 §33.5.1](../33-cost-model-and-finops.md)).

## Consequences

**Positive.** A real efficiency gain on narrative drafting. No personal data egress, by construction rather than by diligence. No possibility of an AI-driven decision about a person. Provider-replaceable, since the client sits behind an interface and prompts are versioned templates ([34 §34.3](../34-future-extensibility.md)). Token cost bounded by per-tenant caps and by the aggregate-only context rule.

**Negative.** A Tier 3 external dependency with its own availability, rate limits and deprecation schedule. Output quality is constrained by aggregate-only context — the model cannot cite a specific case study because it cannot see one, which some users will find limiting and which is the correct trade. Cost scales with use, requiring caps and monitoring. Prompt injection via field-submitted text is a genuine threat requiring its own test corpus and guardrails ([18 §18.12](../18-ai-llm-architecture.md)). Human review is a real workload, not a formality, and if it becomes a rubber stamp the AI-2 control has failed in practice while appearing to hold.

**The unresolved tension.** Donor-facing documents are not externally marked as AI-assisted, though full internal traceability is retained. Marking them would be more transparent to the donor; it would also make the feature unusable in practice, and the organisation genuinely is accountable for text it approved and submitted. The compromise is recorded here rather than hidden, and it is the part of this decision most likely to be revisited if donor expectations change.
