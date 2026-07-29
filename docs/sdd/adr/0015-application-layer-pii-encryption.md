# ADR-0015 — Application-Layer PII Encryption with Per-Tenant Keys

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-05-12 |
| **Deciders** | Security Lead, Chief Architect, Data Architect, DPO |
| **Consulted** | Platform Lead |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [14 §14.4](../14-security-architecture.md), [17](../17-privacy-and-compliance.md), [ADR-0002](0002-hybrid-multi-tenancy-with-rls.md) |

---

## Context

Cloud SQL encrypts data at rest with Google-managed or customer-managed keys. That protects against physical disk compromise and satisfies most compliance checklists.

It does not protect against the threats that actually concern this platform:

| Threat | Does disk encryption help? |
| --- | --- |
| A database dump obtained through a compromised credential | **No.** The dump is decrypted transparently |
| A backup file exfiltrated from object storage | **No**, if the attacker also has the KMS key used for the storage |
| A logic defect returning another tenant's rows | **No** |
| SQL injection reaching data | **No** |
| An operator with break-glass access reading beneficiary records | **No** |

The data in question is names, locations, household composition and vulnerability assessments of people in conflict settings, where the consequence of exposure can be physical harm ([32](../32-risk-register.md) R-02, impact 5).

Disk encryption answers "what if someone steals the disk", which is not the likely attack.

## Decision

**Personal data fields are encrypted in the application with AES-256-GCM under per-tenant data keys, using envelope encryption with Cloud KMS.**

| Aspect | Detail |
| --- | --- |
| Scope | Every field in the classification inventory at Confidential or above ([17 §17.4](../17-privacy-and-compliance.md)): names, national IDs, phone numbers, precise locations, dates of birth, household details, salary amounts, bank details |
| Algorithm | AES-256-GCM, an authenticated mode. Tampering is detectable, not merely undecryptable |
| Key hierarchy | A KMS key encryption key per tenant, wrapping a data encryption key per tenant, cached in memory with a bounded TTL |
| Storage | `..._encrypted BYTEA` columns holding ciphertext, nonce and auth tag |
| Searchability | A blind index — HMAC of the normalised value under a separate per-tenant index key — for exact-match lookup. **No ordering, no prefix, no fuzzy matching on encrypted fields** |
| Access | Only the owning service decrypts, and only within a request holding the appropriate permission. Every decryption of a Restricted field is purpose-logged ([17 §17.6](../17-privacy-and-compliance.md)) |
| Rotation | Data keys rotated annually or on suspected compromise; re-encryption is a background job ([RB-09 §5.3](../runbooks/rb-09-secret-rotation.md)) |
| Erasure | Tombstoning sets the ciphertext column to `NULL`. Key destruction is **not** the erasure mechanism, because one key covers a whole tenant |

The per-tenant key boundary is the load-bearing property: **ciphertext from tenant A cannot be decrypted with tenant B's key.** Even if every other isolation layer failed and a query returned another tenant's rows, the personal data in them is unreadable.

## Alternatives considered

**Rely on Cloud SQL encryption at rest with customer-managed keys.** Simplest, no application change, full query capability retained. Rejected: it defends against none of the threats in the table above, which are the realistic ones.

**PostgreSQL `pgcrypto`, encrypting in the database.** Rejected on two grounds. The key must be available to the database session, so a compromised database credential yields plaintext — the threat model is barely improved. And keys would appear in query text, therefore potentially in logs and in `pg_stat_statements`.

**Transparent Data Encryption at the column level via a proxy.** Rejected: an extra component in the hottest path, and the key handling ends up in the proxy, which is the same problem in a different place.

**A single platform-wide data key rather than per-tenant keys.** Considerably simpler: no per-tenant key provisioning, no per-tenant caching, no key management in tenant lifecycle. Rejected because it abandons the property that makes this decision worth its cost. With one key, a cross-tenant query returns readable data and the last isolation barrier does not exist.

**Encrypt everything, not just classified fields.** Rejected: it would make almost every query incapable of filtering, sorting or joining, and the operational cost is enormous for data whose exposure is not harmful. The classification inventory exists so that the encryption boundary is a deliberate, reviewed line.

**Deterministic encryption to preserve equality search**, rather than a separate blind index. Rejected: deterministic ciphertext leaks equality and frequency information, which for a field like `location` in a small dataset can be enough to re-identify.

## Consequences

**Positive.** A database dump alone yields ciphertext. A backup exfiltration additionally requires KMS access, which is separately controlled, separately audited and revocable. Cross-tenant data, if ever exposed, is unreadable. GCM authentication makes tampering detectable. Per-tenant keys give a clean revocation story and a real answer to a tenant asking who can read their data. This is the control that reduces [16](../16-threat-model-stride.md) T-5.1 from a catastrophic outcome to a contained one.

**Negative, and these constrain the product in visible ways.** No `ORDER BY last_name` on an encrypted column, no `LIKE 'Ab%'`, no fuzzy search — beneficiary search is exact-match on a blind index, or on non-encrypted attributes, and that is a real limitation the UI has to be designed around rather than apologise for. Every read of an encrypted field costs a decryption, and a list of 50 beneficiaries costs 50, which is why aggregate and list views avoid encrypted fields wherever possible. KMS becomes a Tier 1 dependency: if KMS is unavailable, personal data cannot be read or written, which is a failure mode with its own diagnosis path ([RB-16 §6.2](../runbooks/rb-16-sync-failure.md)). Key rotation requires a re-encryption job over potentially large tables. A restore is not verified until a sampled record actually decrypts, which is why that is a mandatory step in [RB-11](../runbooks/rb-11-backup-restore-drill.md) rather than a nice-to-have. Deduplication cannot use fuzzy matching on encrypted names directly, and the algorithm works on normalised blind indexes and non-encrypted attributes instead ([Appendix I](../appendices/i-algorithms.md)).

**The trade, stated plainly.** This decision costs real product capability — sorting, partial-match search, and cheap list rendering on personal data. It is accepted because the alternative is that a single compromised database credential exposes the names and locations of people who may be in danger, and no amount of search convenience justifies that.
