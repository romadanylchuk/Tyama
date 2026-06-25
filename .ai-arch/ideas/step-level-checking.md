# Idea: Step-level Checking
_Created: 2026-06-15_
_Slug: step-level-checking_

## Description
Answer checking is **not binary** "correct/incorrect" but **step-level**: the solution decomposes into ordered steps, and on error the system identifies **which step broke**. That `failedStep` is the input to diagnostic routing. The brief calls this "the most expensive architectural decision — made deliberately at the start."

A **single generic checking engine** walks the unified `steps[]` array (shape locked by [[task-generation]]: `{ prompt, inputMode, expected, skillNode, elicitFromMastery }`) in **semantic order**. Per step it: (1) hands the learner's raw input to the locale-aware normalizer owned by [[locale-numeric-parsing]], (2) compares the canonical result to that step's canonical `expected` using the contract's **normalization policy** (no CAS/equivalence engine — strict canonical matching), (3) on the **first mismatch**, records that step's `skillNode` as `failedStep` and **stops**. If every step matches, the answer is correct. There is one engine, not per-domain checkers; differences across task types are absorbed by `inputMode` + the per-step normalization policy, never by bespoke checking code.

## Priority
blocking

## Maturity
ready

## Decision
_Decided: 2026-06-18_

### What Was Decided

**A — Generic engine, first-break semantics.** One checking engine consumes the unified, ordered, semantic `steps[]` from the [[task-generation]] contract. It walks steps in order; the **first** step whose normalized input ≠ canonical `expected` becomes `failedStep` (carrying that step's `skillNode`), and checking **stops there**. All steps matching ⇒ correct. First-break is chosen over evaluate-all because it yields the single cleanest routing signal and avoids cascade noise (an early wrong value invalidating downstream steps).

**B (Q10) — Strict canonical matching, no `math.js`.** Comparison is `normalize(input, policy) === step.expected`, where `expected` is in canonical form (tech-stack D2) and the per-step **normalization policy** rides on the contract. No runtime CAS / algebraic-equivalence engine in the core — including for the `tokens` inputMode. Alternate-but-valid written forms are handled by the normalization policy, not by equivalence checking. This is consistent with, and inherits, [[task-generation]]'s already-locked rejection of runtime CAS ("CAS equivalence blinds the diagnostic loop by treating different skill atoms as interchangeable").

**C — Locale parsing is delegated, not inlined.** The checker **never parses raw input itself**. It calls the locale-aware normalizer owned and tested by [[locale-numeric-parsing]] before every comparison: `raw → [locale-numeric-parsing.normalize] → canonical → compare`. The fatal-if-wrong decimal-separator / sign logic lives in exactly one tested place. This node depends on that seam; it does **not** decide the parsing strategy itself (that is Q9, owned there).

**Format (Q3) — resolved by inheritance.** "Unified vs per-domain `steps` format" is settled by [[task-generation]]'s locked unified per-step spec. There is one format and one generic engine on top of it; this node adopts it rather than defining a competing per-domain shape.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Evaluate all steps (instead of first-break) | Richer raw signal but needs cascade-suppression rules; an early error poisons later steps and muddies the `failedStep` that diagnostic routing depends on. First-break maps directly to "route to the cause." |
| `math.js` algebraic equivalence for `tokens` | Reintroduces the runtime CAS [[task-generation]] explicitly rejected; blinds the diagnostic loop and adds a core dependency. Backward generation already controls canonical form, so equivalence buys forgiveness the normalization policy can provide more cheaply. |
| Checker parses input inline | Duplicates the fatal-if-wrong locale logic and dissolves the deliberate split that made [[locale-numeric-parsing]] its own blocking node with its own test suite. |
| Per-domain checkers | Defeats the unified-contract spine; each new task type would re-implement checking instead of declaring `inputMode` + normalization policy. |

### Rationale
Every choice is risk-profiling for an anxious learner: the worst failure is marking a correct answer wrong. First-break + strict canonical matching + delegated locale normalization minimize the surface where that can happen and keep the correctness-critical logic in single, unit-testable places. The engine binds to the already-locked generator contract, so it inherits canonical form and the no-CAS stance rather than relitigating them.

### Implications
- **[[diagnostic-loop]]** — receives a single, unambiguous `failedStep.skillNode` per error (first-break). Routing remains a graph traversal over that one cause node; this does **not** decide Q4 (the failedStep→prerequisite algorithm).
- **[[explanation-provider]]** — `context` carries `steps` + the single `failedStep`; consistent with one broken step per submission.
- **[[locale-numeric-parsing]]** — confirmed as the upstream normalization seam the checker calls; its Q9 (exact parse/normalize strategy + locale test matrix) stays open and owned there.
- **[[constrained-answer-entry]]** — Q10 is now resolved on the checking side: `tokens` is matched by strict normalized comparison, so the widget must emit deterministically-normalizable token strings (no need to support free algebraic equivalence).
- **[[task-generation]]** — no change; this node consumes its contract as-is (ordered semantic `steps[]`, canonical `expected`, normalization policy).

## Notes
- Brief §5.5, locked decision #4.
- Each step now carries an `inputMode` (see [[constrained-answer-entry]]); a `tokens`-assembled expression may need an **equivalence check** (`math.js`) where multiple valid written forms are accepted, otherwise strict-form matching suffices (open Q10).
- **Locale-aware number parsing is critical here:** the decimal separator ("3,5" vs "3.5"), multiplication/division signs, thousands separators. Mis-parsing marks correct answers wrong — fatal for an anxious learner. Do not rely on locale auto-detection alone; test fallbacks explicitly. See [[i18n-localization]].
- Open (Q3): a unified `steps` format across all task types vs per-domain, and how to build generic step-level checking on top of it.

## Connections
_Mapped 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[task-generation]] — consumes the ordered `steps`
- ← [[i18n-localization]] — locale-aware decimal parsing (blocking, fatal-if-wrong)
- ← [[tech-stack]] — equivalence libs (math.js) for alternate token forms

**Blocks (→):**
- → [[diagnostic-loop]] — emits `failedStep`, the routing input
- → [[explanation-provider]] — context = steps + failedStep

**Shared concerns:**
- [[i18n-localization]] — locale decimal separator ('3,5' vs '3.5') is checker correctness wearing an i18n hat
- [[constrained-answer-entry]] — the `tokens` widget + whether math.js equivalence or strict matching is needed (Q10)

## History
- 2026-06-15 /architector:new — non-binary, step-decomposed checking that emits failedStep; flagged as the most expensive deliberate decision. v0.3 adds per-step inputMode and the tokens-equivalence question. Locale-aware parsing called out as a fatal-if-wrong concern. Unified-vs-per-domain step format open.
- 2026-06-18 /architector:decide — one generic engine over the unified `steps[]`, **first-break** semantics (first failing step ⇒ `failedStep`, stop) for the cleanest routing signal; Q10 resolved = **strict canonical matching, no math.js** (inherits task-generation's no-CAS lock); locale parsing **delegated to [[locale-numeric-parsing]]**, never inlined; Q3 (unified-vs-per-domain) resolved by inheriting the locked unified format. No own open questions remain → `ready`.
