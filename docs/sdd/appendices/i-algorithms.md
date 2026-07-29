# Appendix I — Algorithms and Worked Examples

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Owner:** Data Architect, with the Chief Architect
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Review Cadence:** Quarterly for statutory rates; annually for scoring models

---

## I.1 Rules that apply to every algorithm here

| Rule | Reason |
| --- | --- |
| **Deterministic.** The same inputs and the same model version always produce the same output | A score that cannot be reproduced cannot be explained or disputed |
| **Versioned.** Every output records the model or ruleset version that produced it | A 2024 score must remain explainable in 2029, after the model has changed |
| **Explainable.** The contributing factors are retained, not just the result | A person affected by a score is entitled to know why ([H.3](h-compliance-traceability.md)) |
| **Exact arithmetic.** `NUMERIC`, never floating point, anywhere near money | [30 FS-04](../30-quality-attributes-nfr.md) |
| **No protected characteristic as an input.** No ethnicity, religion, political affiliation or nationality in any score | [32](../32-risk-register.md) R-12 |
| **Advisory, never automatic.** No score in this appendix automates an exclusion, an entitlement or an eligibility decision | [ADR-0010](../adr/0010-llm-provider-and-boundaries.md), AI-3 |

Worked examples below are checked against the fixture corpus in CI. If an example here disagrees with the implementation, the build fails — this appendix is test input, not illustration.

---

## I.2 Vulnerability scoring

### I.2.1 Model

A weighted additive model over seven factors, producing 0–100. Additive rather than multiplicative because a multiplicative model is far harder to explain to the person scored, and explainability is a requirement rather than a nicety.

| # | Factor | Max | Inputs |
| --- | --- | --- | --- |
| 1 | Dependency ratio | 20 | Members under 15 or over 60, divided by working-age members |
| 2 | Income adequacy | 20 | Household income against a locally-set need threshold per member |
| 3 | Shelter adequacy | 12 | Shelter type |
| 4 | Food security | 15 | Reduced Coping Strategies Index (rCSI) |
| 5 | Displacement status | 10 | Status and duration |
| 6 | Health and disability | 13 | Members with a disability or chronic illness |
| 7 | Household headship | 10 | Child-, female- or elderly-headed |
| | **Total** | **100** | |

### I.2.2 Factor bands

| Factor 1 — dependency ratio | Points |
| --- | --- |
| ≥ 2.00 | 20 |
| 1.50 – 1.99 | 16 |
| 1.00 – 1.49 | 11 |
| 0.50 – 0.99 | 6 |
| < 0.50 | 0 |

| Factor 2 — income ÷ (members × threshold) | Points |
| --- | --- |
| < 0.25 | 20 |
| 0.25 – 0.49 | 17 |
| 0.50 – 0.74 | 14 |
| 0.75 – 0.99 | 8 |
| ≥ 1.00 | 0 |

| Factor 3 — shelter | Points |
| --- | --- |
| None or emergency | 12 |
| Temporary | 8 |
| Semi-permanent | 4 |
| Permanent | 0 |

| Factor 4 — rCSI | Points |
| --- | --- |
| ≥ 43 | 15 |
| 19 – 42 | 11 |
| 4 – 18 | 6 |
| ≤ 3 | 0 |

| Factor 5 — displacement | Points |
| --- | --- |
| Displaced within the last 12 months | 10 |
| Displaced more than 12 months ago | 7 |
| Returnee | 5 |
| Host community | 0 |

| Factor 6 — health, cumulative, capped at 13 | Points |
| --- | --- |
| Each member with a disability | 6 |
| Each member with a chronic illness | 4 |
| Each member under 5 with acute malnutrition | 7 |

| Factor 7 — headship, highest applicable only | Points |
| --- | --- |
| Child-headed (head under 18) | 10 |
| Elderly-headed (head over 65) with dependents | 6 |
| Female-headed with dependents and no adult male | 6 |
| None of the above | 0 |

### I.2.3 Bands

| Score | Band |
| --- | --- |
| 75 – 100 | Severe |
| 50 – 74 | High |
| 25 – 49 | Moderate |
| 0 – 24 | Low |

### I.2.4 Worked example

Household of 7 in Bentiu. Five members under 15 or over 60, two working-age. Monthly income 90,000 SSP; the local need threshold is 22,000 SSP per member. Temporary shelter. rCSI of 22. Displaced eight months ago. One member with a disability, one with a chronic illness. Female-headed with dependents, no adult male.

| Factor | Calculation | Points |
| --- | --- | --- |
| 1 Dependency ratio | 5 ÷ 2 = 2.50 → ≥ 2.00 | **20** |
| 2 Income adequacy | 90,000 ÷ (7 × 22,000 = 154,000) = 0.584 → 0.50–0.74 | **14** |
| 3 Shelter | Temporary | **8** |
| 4 Food security | rCSI 22 → 19–42 | **11** |
| 5 Displacement | Displaced 8 months ago → within 12 months | **10** |
| 6 Health | 6 (disability) + 4 (chronic) = 10, under the cap of 13 | **10** |
| 7 Headship | Female-headed with dependents | **6** |
| | **Total** | **79** |

**Result: 79, band Severe.** Stored with `scoring_model_version = 2` and the factor breakdown in `vulnerability_factors`, so this table can be reproduced for the household on request.

### I.2.5 Properties and limitations, stated

| Property | Note |
| --- | --- |
| **Advisory only** | A score never automatically excludes anyone. `NGOIS-BEN-0060` rejects an attempt to use it that way |
| **The threshold is tenant-configured** | Factor 2 depends on a local need threshold the tenant sets, because 22,000 SSP means something different in Juba and in Bentiu |
| **The bands are a judgement, not a measurement** | The boundary between High and Severe at 75 is a chosen line. Two households on either side are not meaningfully different, and the UI shows the score, not only the band |
| **Missing data reduces the score** | A household with unknown rCSI scores 0 on factor 4, which **understates** their vulnerability. `factors_missing` is recorded and displayed, because a low score from absent data must not read as a low score from good circumstances |
| **Reviewed annually for disparate impact** | Score distribution is examined by sex of head, displacement status and location ([32](../32-risk-register.md) R-12) |

The missing-data behaviour is the model's sharpest weakness. The alternative — imputing a value — would produce a score that looks complete and is invented, which is worse.

---

## I.3 Grant budget burn rate

### I.3.1 Formula

```
elapsed_fraction = days_elapsed / total_grant_days
spend_fraction   = cumulative_expenditure / total_budget
burn_index       = spend_fraction / elapsed_fraction
projected_spend  = cumulative_expenditure / elapsed_fraction
```

| Burn index | Assessment |
| --- | --- |
| > 1.30 | Significant over-spend; ceiling breach likely |
| 1.15 – 1.30 | Over-spending |
| 0.85 – 1.15 | On track |
| 0.70 – 0.85 | Under-spending |
| < 0.70 | Significant under-spend; **an unspent-funds risk, which for many donors is as serious as an over-spend** |

### I.3.2 Worked example

A 500,000 USD grant running 1 January to 31 December 2027 (365 days). As at 30 June 2027, cumulative expenditure is 185,000 USD.

| Step | Calculation | Result |
| --- | --- | --- |
| Days elapsed | 1 Jan – 30 Jun | 181 |
| Elapsed fraction | 181 ÷ 365 | 0.4959 |
| Spend fraction | 185,000 ÷ 500,000 | 0.3700 |
| **Burn index** | 0.3700 ÷ 0.4959 | **0.746** |
| Projected year-end spend | 185,000 ÷ 0.4959 | 373,059 USD |
| Projected unspent | 500,000 − 373,059 | **126,941 USD** |

**Assessment: 0.746, under-spending.** Surfaced with the projected unspent figure rather than the index alone, because "you are on course to return 127,000 USD to the donor" prompts action and "burn index 0.746" does not.

Burn rate is calculated on **linear** expectation deliberately. Real grants are not linear — a distribution-heavy quarter spends more — so the index is a screening signal, and the reporting view shows the monthly expenditure curve alongside it.

---

## I.4 SLO error budget burn rate

### I.4.1 Formula

```
error_budget      = 1 − SLO_target
observed_ratio    = failed_events / total_events   (over the window)
burn_rate         = observed_ratio / error_budget
budget_consumed   = burn_rate × (window_hours / 720)
time_to_exhaustion = 720 hours / burn_rate
```

720 hours is the 30-day SLO window.

### I.4.2 Multi-window alerting

A single threshold either pages on brief blips or misses a slow bleed. Two windows are required to fire together, so a burst must both be severe and be sustained ([24 §24.8.2](../24-observability.md)).

| Burn rate | Long window | Short window | Budget consumed by the long window | Action |
| --- | --- | --- | --- | --- |
| 14.4 | 1 hour | 5 min | 2 % | **Page** |
| 6 | 6 hours | 30 min | 5 % | **Page** |
| 3 | 1 day | 2 hours | 10 % | Ticket |
| 1 | 3 days | 6 hours | 10 % | Ticket |

### I.4.3 Worked example

SLO S-1, platform availability, 99.5 per cent over 30 days. Error budget = 0.005.

Over one hour: 42,000 requests, 1,050 returning 5xx.

| Step | Calculation | Result |
| --- | --- | --- |
| Observed ratio | 1,050 ÷ 42,000 | 0.0250 |
| **Burn rate** | 0.0250 ÷ 0.005 | **5.0** |
| Budget consumed in that hour | 5.0 × (1 ÷ 720) | 0.69 % |
| Time to exhaustion at this rate | 720 ÷ 5.0 | **144 hours, or 6 days** |

Burn rate 5.0 is below the 14.4 fast-burn threshold but above the 3.0 slow-burn threshold, so with a sustained 6-hour window it raises a ticket rather than a page. If the same ratio persisted, the month's entire budget would be gone in six days.

### I.4.4 The policy attached to the number

| Budget consumed in the window | Consequence |
| --- | --- |
| Under 50 % | Normal operation |
| 50 – 75 % | Reliability work is prioritised in the next iteration |
| Over 75 % | **Feature work halts** until the budget recovers; only reliability and security changes ship |
| Exhausted | Halt plus a written review to the Executive Director |

Two SLOs have **no error budget** because their target is 100 per cent: S-6 submission durability and S-7 payroll correctness. Any failure of either is a SEV-1 with a mandatory postmortem, and the burn-rate framework does not apply — there is nothing to burn.

---

## I.5 Grant compliance score

### I.5.1 Model

Five weighted components, 0–100.

| # | Component | Weight | Formula |
| --- | --- | --- | --- |
| 1 | Reporting timeliness | 30 | `30 × (on_time + 0.5 × late_within_grace) ÷ reports_due`; grace is 7 days |
| 2 | Budget discipline | 20 | From `dev = abs(1 − burn_index)`: full marks if `dev ≤ 0.15`; zero if `dev ≥ 0.50`; linear between |
| 3 | Documentation completeness | 20 | `20 × documents_present ÷ documents_required` |
| 4 | Expenditure eligibility | 15 | `15 × (1 − flagged_ineligible ÷ total_expenditures)` |
| 5 | Training compliance | 15 | `15 × staff_current ÷ staff_requiring` |

| Score | Band |
| --- | --- |
| 90 – 100 | Strong |
| 75 – 89 | Adequate |
| 60 – 74 | Needs attention |
| < 60 | At risk |

### I.5.2 Worked example

The same 500,000 USD grant at 30 June 2027. Six reports due; five submitted on time; one submitted 4 days late. Burn index 0.746 from [§I.3.2](#i32-worked-example). Documentation: 48 of 52 required items present. Expenditure: 2 of 340 transactions flagged ineligible. Training: 18 of 22 staff current on mandatory courses.

| # | Calculation | Points |
| --- | --- | --- |
| 1 | 4 days is within the 7-day grace → `30 × (5 + 0.5) ÷ 6` = `30 × 0.9167` | **27.50** |
| 2 | `dev = abs(1 − 0.746) = 0.254`; `(0.50 − 0.254) ÷ (0.50 − 0.15) = 0.703`; `20 × 0.703` | **14.06** |
| 3 | `20 × 48 ÷ 52` = `20 × 0.9231` | **18.46** |
| 4 | `15 × (1 − 2 ÷ 340)` = `15 × 0.9941` | **14.91** |
| 5 | `15 × 18 ÷ 22` = `15 × 0.8182` | **12.27** |
| | **Total** | **87.20** |

**Result: 87.2, band Adequate.** The `grant.compliance.recalculated` event carries the component breakdown so a change is explainable — a drop from 92 to 87 is answerable as "budget discipline fell because spending is behind schedule", not merely as a lower number.

Component 2 is the interesting one: the grant is compliant in every procedural respect and loses six points purely because it is under-spending. That is intentional. Under-spending is a compliance problem with donors, not just a financial curiosity.

---

## I.6 Payroll calculation

> **Rates below are illustrative of the model's structure.** The authoritative values live in `tax_bands` and `statutory_contribution_rates`, each row carrying a `source_reference` to the statute or gazette, and each jurisdiction's figures are verified by an **independent accountant** before release ([31 §31.4.2](../31-implementation-roadmap.md)). Correct arithmetic against a misread statute is still wrong.

### I.6.1 The engine is jurisdiction-agnostic

The calculation engine knows about ordering, proration, rounding and reproducibility. It knows nothing about tax. Each jurisdiction supplies a rule module declaring components, each with a **basis** — which earnings it applies to — and an **order**.

The two jurisdictions differ in a way that makes this necessary rather than tidy:

| | South Sudan | Uganda |
| --- | --- | --- |
| Social contribution | NSIF: employee 8 %, employer 17 % | NSSF: employee 5 %, employer 10 % |
| **Is the employee contribution deductible before income tax?** | **Yes** | **No** |
| Additional local levy | — | Local Service Tax |

That single difference in deductibility changes the order of operations and the tax base. A formula with a jurisdiction flag would be unverifiable; a component model with an explicit basis is testable per component ([ADR-0019](../adr/0019-narrow-extension-points.md)).

### I.6.2 South Sudan — illustrative monthly PAYE bands

| Monthly taxable income (SSP) | Rate |
| --- | --- |
| 0 – 3,000 | 0 % |
| 3,001 – 5,000 | 10 % |
| 5,001 – 10,000 | 15 % |
| Above 10,000 | 20 % |

### I.6.3 Worked example — South Sudan

Employee: basic salary 40,000 SSP; housing allowance 8,000 SSP (taxable, pensionable); transport allowance 3,000 SSP (non-taxable, non-pensionable). Full month worked.

| Step | Component | Basis | Calculation | Amount (SSP) |
| --- | --- | --- | --- | --- |
| 1 | Gross pay | — | 40,000 + 8,000 + 3,000 | **51,000.00** |
| 2 | Pensionable pay | Basic + housing | 40,000 + 8,000 | 48,000.00 |
| 3 | Taxable gross | Basic + housing | 40,000 + 8,000 | 48,000.00 |
| 4 | NSIF employee | 8 % of pensionable | 48,000 × 0.08 | **3,840.00** |
| 5 | NSIF employer | 17 % of pensionable | 48,000 × 0.17 | **8,160.00** |
| 6 | PAYE base | Taxable gross − NSIF employee | 48,000 − 3,840 | 44,160.00 |
| 7 | PAYE band 1 | 0 – 3,000 at 0 % | 3,000 × 0.00 | 0.00 |
| 8 | PAYE band 2 | 3,001 – 5,000 at 10 % | 2,000 × 0.10 | 200.00 |
| 9 | PAYE band 3 | 5,001 – 10,000 at 15 % | 5,000 × 0.15 | 750.00 |
| 10 | PAYE band 4 | above 10,000 at 20 % | 34,160 × 0.20 | 6,832.00 |
| 11 | **PAYE total** | | 0 + 200 + 750 + 6,832 | **7,782.00** |
| 12 | **Net pay** | Gross − NSIF employee − PAYE | 51,000 − 3,840 − 7,782 | **39,378.00** |
| 13 | **Employer cost** | Gross + NSIF employer | 51,000 + 8,160 | **59,160.00** |

Every one of these thirteen rows is persisted as a `payroll_record_line` with its `basis_amount`, `rate_applied` and `source_reference` ([Appendix B §B.4](b-data-dictionary.md)). That is what makes a payslip explainable and a dispute answerable four years later.

### I.6.4 Uganda — illustrative monthly PAYE

| Monthly chargeable income (UGX) | Tax |
| --- | --- |
| 0 – 235,000 | Nil |
| 235,001 – 335,000 | 10 % of the excess over 235,000 |
| 335,001 – 410,000 | 10,000 + 20 % of the excess over 335,000 |
| 410,001 – 10,000,000 | 25,000 + 30 % of the excess over 410,000 |
| Above 10,000,000 | 25,000 + 30 % of the excess over 410,000, plus 10 % of the excess over 10,000,000 |

### I.6.5 Worked example — Uganda

Employee: gross monthly 1,200,000 UGX, all taxable and pensionable. The month falls within the Local Service Tax deduction window, where an annual LST of 100,000 UGX is recovered over four months.

| Step | Component | Basis | Calculation | Amount (UGX) |
| --- | --- | --- | --- | --- |
| 1 | Gross pay | — | — | **1,200,000** |
| 2 | NSSF employee | 5 % of gross | 1,200,000 × 0.05 | **60,000** |
| 3 | NSSF employer | 10 % of gross | 1,200,000 × 0.10 | **120,000** |
| 4 | PAYE base | Gross. **NSSF is not deductible** | 1,200,000 | 1,200,000 |
| 5 | PAYE | 25,000 + 30 % over 410,000 | 25,000 + (790,000 × 0.30) = 25,000 + 237,000 | **262,000** |
| 6 | LST | Annual 100,000 ÷ 4 months | 100,000 ÷ 4 | **25,000** |
| 7 | **Net pay** | Gross − NSSF − PAYE − LST | 1,200,000 − 60,000 − 262,000 − 25,000 | **853,000** |
| 8 | **Employer cost** | Gross + NSSF employer | 1,200,000 + 120,000 | **1,320,000** |

Contrast step 4 with step 6 of the South Sudan example. Same engine, same employee gross conceptually, entirely different base — because one statute allows the deduction and the other does not.

### I.6.6 Edge cases in the fixture corpus

Every one of these is a test with an expected output, and all must pass at 100 per cent ([31 §31.4.2](../31-implementation-roadmap.md), criterion 1).

| Case | Expected behaviour |
| --- | --- |
| Mid-month joiner | Proration by calendar days worked ÷ days in month, applied to basic and pensionable allowances; statutory bands **not** prorated |
| Mid-month leaver | Same, plus final-settlement components |
| Exactly at a band boundary | The lower band applies to the boundary value. `44,160.00` and `44,160.004` must not differ |
| Rounding | Half-up at two decimal places, applied **per component**, not to the total. Component sums must equal the stated total exactly |
| Negative net pay | **Blocked**, not paid. `NGOIS-PAY-0052`. Deductions exceeding gross is a data problem, not an outcome |
| Zero gross | Produces a zero record, not an error — an employee on unpaid leave still appears |
| Multi-currency employees in one run | Each computed in its contract currency; run totals stated per currency with the FX set frozen at calculation |
| Missing tax band for the period | **Blocked** with `NGOIS-PAY-0031`. Never a silent zero |
| Stale FX rate over 7 days | **Blocked** with `NGOIS-PAY-0117`, stating the age |
| Reversal and recomputation | Same `ruleset_hash` must yield byte-identical output ([30 FS-02](../30-quality-attributes-nfr.md)) |
| Retrospective statutory change | Must **not** alter an approved historical run |

---

## I.7 Beneficiary deduplication

### I.7.1 The constraint that shapes the algorithm

Names are encrypted under per-tenant keys, so there is no plaintext to fuzzy-match against ([ADR-0015](../adr/0015-application-layer-pii-encryption.md)). A conventional edit-distance approach is unavailable.

The solution is to compute matchable keys **before encryption, on the device or in the service**, and store them as HMACs:

| Key | Construction |
| --- | --- |
| `name_index` | HMAC of the normalised full name: lowercased, diacritics stripped, punctuation removed, tokens sorted alphabetically. So "Nyandeng A. Deng" and "deng nyandeng a" produce the same key |
| `name_phonetic_index` | HMAC of a Double Metaphone code per token, sorted. Matches "Nyandeng" against "Nyadeng" without ever holding either in plaintext |
| `phone_index` | HMAC of the phone number in E.164 form |
| `national_id_index` | HMAC of the identifier, whitespace and case normalised |

Equality is therefore testable; ordering and prefix matching are not.

### I.7.2 Scoring

Signals are additive, capped at 100.

| Signal | Points |
| --- | --- |
| `national_id_index` exact match | 60 |
| `name_index` exact match | 40 |
| `name_phonetic_index` match, where `name_index` does not match | 25 |
| `phone_index` exact match | 30 |
| Birth year exact | 12 |
| Birth year within ±1 | 6 |
| Sex matches | 5 |
| Same administrative area | 8 |
| Same household | 15 |
| Registered within 30 days of each other | 5 |

| Score | Outcome |
| --- | --- |
| ≥ 70 | **Flagged as a probable duplicate**, routed for review. The submission is still **accepted** |
| 45 – 69 | Flagged as a possible duplicate, lower review priority |
| < 45 | No flag |

### I.7.3 Worked examples

**A — near-certain duplicate.** Same national ID, same normalised name.

| Signal | Points |
| --- | --- |
| `national_id_index` match | 60 |
| `name_index` match | 40 |
| **Total** | **100** |

Probable duplicate. Note that even at 100, **no merge occurs.**

**B — a genuine duplicate from two officers, spelt differently.** "Nyandeng Deng" and "Nyadeng Deng", same phone, same birth year, same sex, same district.

| Signal | Points |
| --- | --- |
| `name_phonetic_index` match | 25 |
| `phone_index` match | 30 |
| Birth year exact | 12 |
| Sex matches | 5 |
| Same administrative area | 8 |
| **Total** | **80** |

Probable duplicate. This is the case the phonetic index exists for.

**C — two different people who look similar.** Brothers with phonetically similar names in the same village, registered in the same week, no shared phone or identifier, different birth years more than a year apart.

| Signal | Points |
| --- | --- |
| `name_phonetic_index` match | 25 |
| Sex matches | 5 |
| Same administrative area | 8 |
| Registered within 30 days | 5 |
| **Total** | **43** |

**No flag.** Correctly so — and this example is in the fixture corpus specifically to prevent a threshold change from breaking it.

### I.7.4 Why the thresholds sit where they do

The two error types have very unequal costs.

| Error | Cost |
| --- | --- |
| **False positive** — flagging two distinct people | A reviewer spends five minutes and dismisses it |
| **False negative** — missing a real duplicate | Double counting in reach figures, potential double distribution |
| **False merge** — combining two distinct people | **Can erase a person's entitlement and their registration history.** Effectively irreversible in operational terms |

So thresholds are biased toward flagging, and **merging is never automatic at any score** ([13 §13.6](../13-offline-first-architecture.md)). A merge requires a recorded human decision with a rationale, logged append-only in `beneficiary_merge_log`.

If flagging becomes too noisy — a large `pending_review` count, per [RB-16 §6.5](../runbooks/rb-16-sync-failure.md) — the response is to review the weights with the tenant, not to raise the threshold until the queue is comfortable.

---

## I.8 k-anonymity suppression

### I.8.1 Rule

No published or externally-visible aggregate may represent a cohort of fewer than **5** ([30 PR-08](../30-quality-attributes-nfr.md)). Applies to IATI publication, donor-facing dashboards, exports to third parties, and any context assembled for the LLM ([ADR-0010](../adr/0010-llm-provider-and-boundaries.md)).

```
for each cell in the aggregate:
    if cell.count > 0 and cell.count < 5:
        suppress cell
        mark as "fewer than 5"
then:
    for each row and column containing a suppressed cell:
        if only one cell was suppressed in that row or column:
            suppress the next-smallest non-zero cell in it   # complementary suppression
    recompute totals from published cells only
```

### I.8.2 Worked example

Beneficiaries reached by district and sex, for donor publication.

| District | Female | Male | Total |
| --- | --- | --- | --- |
| Rubkona | 412 | 388 | 800 |
| Guit | 96 | 104 | 200 |
| Koch | **3** | 61 | 64 |
| Mayendit | 44 | 39 | 83 |

Koch/Female is 3, below the threshold.

**Naive suppression is not enough.** Publishing the Koch total of 64 alongside a suppressed female cell and a male cell of 61 lets any reader compute 64 − 61 = 3. Complementary suppression is required.

| District | Female | Male | Total |
| --- | --- | --- | --- |
| Rubkona | 412 | 388 | 800 |
| Guit | 96 | 104 | 200 |
| Koch | *< 5* | *suppressed* | *suppressed* |
| Mayendit | 44 | 39 | 83 |
| **Published total** | **552** | **531** | **1,083** |

Both Koch cells and the Koch total are withheld, and the published totals are recomputed from published cells only — 412 + 96 + 44 = 552, 388 + 104 + 39 = 531, giving 1,083 rather than the true 1,147.

**The published total is deliberately not the true total.** Publishing 1,147 alongside 552 and 531 would allow the suppressed cells to be recovered by subtraction. A footnote states that totals exclude suppressed cells, which is the honest way to present it.

### I.8.3 Where the rule applies and where it does not

| Context | k = 5 enforced? |
| --- | --- |
| IATI publication | **Yes**, and it overrides tenant configuration ([12 §12.4.3](../12-integration-architecture.md)) |
| Donor-facing dashboards and reports | **Yes** |
| Context assembled for the LLM | **Yes** — the service can read nothing else |
| Third-party exports | **Yes** |
| A tenant's own internal reporting on their own beneficiaries | **No.** They are the controller and have a legitimate operational need to see a cohort of three |
| A tenant's own data export | **No.** It is their data |

The distinction is between a tenant seeing their own operational data and data leaving the tenant's control. The rule protects against re-identification by outsiders, not against a tenant knowing who they are assisting.
