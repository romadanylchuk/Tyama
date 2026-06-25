# Idea: Task Generation (Contract, Registry & Generators)
_Created: 2026-06-15_
_Slug: task-generation_

## Description
Each task type is a **procedural code generator** (not an LLM, not a stored bank) behind a **single contract**, registered in a **build-time plugin registry** keyed to skill-graph slug node IDs. The key technique is **backward generation from a pre-chosen answer**, which guarantees correctness, a unique solution, and free deterministic checking. "A new level = a new module implementing the contract and registered in the graph" — the answer to the extensibility requirement.

Contract: `generate(difficulty: DifficultyParams) → { problem, solution, steps, representation, skillNode }`, with per-step spec `steps[]: { prompt, inputMode, expected, skillNode, elicitFromMastery }`. `steps` is an **ordered array** with **semantic order** (the sequence step-level-checking advances through and scaffolding-fade elicits from); each step's `expected` is in **canonical form** and the contract carries the **normalization policy**, not just the value. Generators register **statically at build time** — no OTA-shipped generators in MVP (executable answer-judging code must not bypass store review).

## Decision
_Decided: 2026-06-16_

### What Was Decided

**#1+#2 — Locked spine (formalized).**
- **Procedural code generators**, no LLM, no stored bank. **Backward generation from a pre-chosen answer** → guaranteed correctness, unique solution, free deterministic checking, known intermediate steps.
- **Single contract, plugin registry keyed to skill-graph slug node IDs.** "New level = new module + graph node."
- **Contract:** `generate(difficulty: DifficultyParams) → { problem, solution, steps, representation, skillNode }`, with per-step spec `steps[]: { prompt, inputMode, expected, skillNode, elicitFromMastery }`.
- **Load-bearing notes:** `steps` is an **ordered array** whose order is **semantic** (the solution sequence step-level-checking advances through, and the rungs scaffolding-fade chooses to elicit). Each step's `expected` is in **canonical form** (tech-stack D2); the contract carries the **normalization policy**, not just the value.

**#3 / Q5 — Generators register STATICALLY at build time. No OTA-shipped generators in MVP.**
- A generator OTA-ships **executable code that generates math and judges a learner's answer**; a bad generator tells an anxious learner their correct answer is wrong — the worst failure for this audience — and arrives **past store review** (EAS Update bypasses review). Backward generation makes generators **deterministic and unit-testable**, so bugs are caught pre-release, not hot-patched in prod.
- **Graph = OTA-capable seam (OTA off in MVP); generators = registry seam, OTA deliberately forbidden.** Data vs code = precise risk-profiling, not inconsistency. May open later only behind a validation layer (signed bundles + runtime sanity-check of generated output against its own `solution`).
- **Graceful-degradation requirement:** an OTA graph update can add a node whose generator isn't in the installed build. The registry must answer "no generator for this slug" **without crashing** — such a node renders as "coming soon" / excluded from the active queue.

**#4 — MVP generator set: four CONTRACT VALIDATORS (not four topics).** Chosen to stretch the contract across all five inputModes, both ends of CPA, the speed dimension, and multi-step checking:
- **sticks / number-bonds** — `manipulative`/`choice`, concrete → lightest input + CPA floor.
- **multiplication** — `number` drill → validates the **speed dimension** of mastery.
- **fruit-equations** — `tokens`/`number`, pictorial→abstract → hardest input + scaffolding-fade over a multi-step solution.
- **fraction-simplification** — `manipulative` + multi-slot → ≥2 semantic steps + **canonical lowest-terms form**. *Simplification specifically* (not common-denominator addition): unique manipulative-fraction + irreducible-form angle; another fraction node would duplicate coverage.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| OTA-loadable generators (Q5) | Routes the most trust-critical code (answer judging) through an ungated channel past store review; a bad generator marks correct answers wrong for an anxious learner. Convenience is defused by deterministic, unit-testable generators. |
| LLM / stored task bank for the math core | LLMs hallucinate in math; a bank can't guarantee unique solutions, free checking, or known intermediate steps. (Brief locked decision #3.) |
| Runtime CAS for answer equivalence | Backward generation already controls canonical form; CAS equivalence blinds the diagnostic loop by treating different skill atoms as interchangeable (tech-stack D2). |
| A different/additional fraction generator (e.g. common-denominator addition) | Duplicates multi-slot + canonical coverage that simplification already provides; under-tests manipulative-fraction. Set is 4 validators, not 4 topics. |

### Rationale
The set and the static-registration default are both **risk-profiling for an anxious-learner audience**: the contract is the API every downstream node binds to, so it is locked deliberately and early; answer-judging code is kept behind store review; the four generators are picked to exercise the full contract surface rather than to enumerate topics.

### Implications
- **[[step-level-checking]]** — consumes the ordered, semantic `steps[]` and per-step canonical `expected` + normalization policy.
- **[[constrained-answer-entry]]** — must render all five `inputMode`s exercised by the MVP set (`manipulative`, `choice`, `number`, `tokens`, multi-slot).
- **[[skill-graph]]** / **[[local-persistence]]** — graph OTA-add can outrun a generator release; the registry's "no generator for slug → coming soon, no crash" behavior is now a **hard requirement** on the registry and the node-queue/UI.
- **[[difficulty-model]]** — Q2 (universal vs per-generator `DifficultyParams`) remains open there; not decided here.
- **[[explanation-provider]]** — receives `problem`/`method`/`steps`/`failedStep` from this contract.

## Notes
- Brief §5.3–5.4, locked decisions #3 (procedural, backward-from-answer) and #8 (registry behind one contract).
- Indicative contract: `generate(difficulty: DifficultyParams) → { problem, solution, steps, representation, skillNode }`. Final form is the architect's call.
- v0.3 update: each **step** carries its own input spec — `{ prompt, inputMode, expected, skillNode, elicitFromMastery }`. This extends (does not replace) the locked contract. See [[constrained-answer-entry]] and [[difficulty-model]].
- Why code not LLM: guaranteed correctness (no non-integer/degenerate systems), free checking (answer is constructed), step-level checking becomes possible, difficulty = function parameters.
- MVP minimum 3–5 generators: sticks/number bonds, multiplication, fruit equations, fraction simplification (final set by priority).
- Open (Q5): static build-time registration vs OTA-loadable config/levels (Expo OTA).

## Connections
_Mapped 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[skill-graph]] — registers against node IDs
  - _Dependency satisfied (skill-graph A1/A5, /decide 2026-06-15): register generators against slug node IDs; read `difficultyHooks`. No edge-semantics caveat._
- ← [[local-persistence]] — stable node IDs to register against
- ← [[difficulty-model]] — DifficultyParams is the generator input

**Blocks (→):**
- → [[step-level-checking]] — emits the ordered `steps`
- → [[constrained-answer-entry]] — steps carry inputMode the widgets render

_Also contributes problem/method/steps to [[explanation-provider]] context (aggregated edge)._

## History
- 2026-06-15 /architector:new — procedural generators, backward from a chosen answer, behind one registry contract; merged the contract/registry seam with the generator implementations. Step shape extended in v0.3 to carry inputMode + elicitFromMastery. Registration strategy (static vs OTA) open.
- 2026-06-16 /architector:decide — formalized the locked spine (procedural + backward-from-answer + single build-time registry); resolved Q5 = **generators register statically, NO OTA** (executable answer-judging code must not bypass store review; graph stays OTA-capable, generators do not — data vs code risk-profiling), with a new **"no generator for slug → no crash"** registry requirement; confirmed the MVP set as **4 contract validators** (sticks/number-bonds, multiplication, fruit-equations, fraction-*simplification*) covering all 5 inputModes / both CPA ends / speed / multi-step. Q2 left to [[difficulty-model]]. → `ready`.
