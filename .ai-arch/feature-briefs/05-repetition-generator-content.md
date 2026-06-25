# Feature Brief: Spaced Repetition & Full Generator Content
_Stage: 05_
_Created: 2026-06-24 via /architector:finalize_
_Arch nodes covered: spaced-repetition (+ completes task-generation's MVP generator set)_

## Goal
Deliver the retention mechanism the app exists to provide — banded spaced repetition via a pure scheduling function over the opaque queue — and complete the content: the three remaining generators (sticks/number-bonds, multiplication, fraction-simplification) under the already-validated contract. With this stage, all four MVP generators exist and mastered skills return on a schedule.

## Context
- The generator **contract + registry were validated in stage 02** with fruit-equations. This stage adds the remaining three. They are deliberately built *after* checking (03) and the diagnostic loop (04) exist, per the brief's build order (validate the contract with one, then scale content).
- **The MVP set is 4 *contract validators*, not 4 topics** — chosen to stretch the contract across all five inputModes, both CPA ends, the speed dimension, and multi-step checking.
- **Spaced repetition = banded in-house intervals, NOT SM-2** (Q8). SM-2 models binary flashcard recall and has nowhere to hold Tyama's speed dimension. Banded fits accuracy + speed honestly and matches the "basic" MVP scope.
- **Seam A: pure-function scheduler over a dumb store.** local-persistence (stage 01) owns the queue rows as **opaque materialized state** (`intervalBandIndex` + `dueAt`); spaced-repetition owns a **pure** `(queueItem, reviewOutcome) → updated scheduling fields` function that never touches storage APIs. This is the repo's locked logic-behind-contract / persistence-as-dumb-substrate pattern.

## What Needs to Be Built
1. **The three remaining generators** (each implementing the stage-02 contract, registered against graph slug IDs, backward-from-answer, canonical `expected` + normalization policy, exercising their committed inputModes):
   - **sticks / number-bonds** — `manipulative` / `choice`, concrete → the CPA floor + lightest input.
   - **multiplication** — `number` drill → validates the **speed dimension** of mastery.
   - **fraction-simplification** — `manipulative` + multi-slot → ≥2 semantic steps + **canonical lowest-terms form**. *Simplification specifically* (not common-denominator addition): the unique manipulative-fraction + irreducible-form angle.
   - Each must produce valid `steps[]` consumed by stage-03 checking and render through the stage-03 widgets; multi-slot fraction input must decompose into per-slot `rawInput`s (stage 03 boundary).
2. **The banded spaced-repetition scheduler:**
   - **Pure function** `(queueItem, reviewOutcome) → updated scheduling fields`. No storage calls.
   - **Bands** (e.g. `1d → 3d → 7d → 16d → …`): promote on a clean+fast pass, **hold** on correct-but-slow, demote on lapse.
   - **`reviewOutcome` is speed-aware, not boolean** — carries at minimum `correct?` + speed-relative-to-threshold (the same speed threshold owned by mastery-gates, stage 04). "Correct but slow" and "correct and instant" must NOT yield the same next interval.
   - **Demote on lapse = ONE band, never reset-to-band-0** (single-lapse reset is punitive — one slip after a month wiping the schedule rubs against the north star).
   - **Persisted fields:** `intervalBandIndex` + `dueAt` (+ optional `lapses` for **telemetry only**, never logic). Stored as opaque rows by stage 01.
   - **Only nodes past `masteryThreshold` enter the queue** (mastery-gates gate, stage 04).
3. **Boundary enforcement with diagnostic-loop (do not merge):** band-demotion is a **local scheduler action** (shift the band *within* a node). Routing to a broken prerequisite, or evicting a node from "mastered" back into learning, is **diagnostic-loop's** job (stage 04) — a different decision on a different axis. Failed reviews still reroute *through* the stage-04 traversal; the scheduler only moves the band.

## Dependencies
- **Requires:** 04 (mastery-gates supplies the speed threshold for `reviewOutcome` and the gate that admits only mastered nodes; diagnostic-loop owns the un-mastering/eviction boundary), 03 (checking + widgets the new generators feed/render through), 02 (the generator contract + registry + `DifficultyParams`), 01 (opaque queue storage).
- **Enables:** 06 (the capped due-reviews queue is one of gamification's three "where to next" sources).

## Key Decisions Already Made
- **Banded in-house intervals over SM-2** — SM-2 models the wrong thing (binary recall) with nowhere for the speed dimension.
- **Seam A (pure-function scheduler over an opaque store)** — the only option contradicting no locked decision; matches the generator/ExplanationProvider seam discipline. Seam B (scheduler owns persistence) and Seam C (logic in persistence) both introduce a competing organizing pattern and re-collide with the truth-model.
- **`reviewOutcome` speed-aware, not boolean** — a boolean outcome throws away the speed dimension at the seam (the SM-2 failure, one level up).
- **One-band demote, not reset** — reset-on-lapse is a punitive profile against the north star.
- **`lapses` is telemetry-only** — never feeds logic.
- **MVP generator set = 4 validators** — a different/additional fraction generator (common-denominator addition) was rejected as duplicating multi-slot + canonical coverage that simplification already provides.

## Open Technical Questions
- Exact band intervals and the promote/hold/demote thresholds (shipped defaults; per-atom speed thresholds come from `difficultyHooks`).
- The precise `reviewOutcome` shape (how speed-relative-to-threshold is quantized into promote/hold).
- Each new generator's opaque `params` payload shape and its `difficultyHooks` default bands.
- The fraction-simplification multi-slot step decomposition specifics (coordinate with stage 03's composite-input boundary).
- How a due review is surfaced into the session loop and the cap applied (the cap itself is gamification's, stage 06 — but the queue read shape is defined here).

## Out of Scope for This Stage
- The "where to next" prioritization and the due-review **cap** → gamification (stage 06); this stage owns the scheduler + queue logic, not the merge policy.
- Un-mastering / queue-eviction / prerequisite routing → diagnostic-loop (stage 04); strictly separate from band-demotion.
- A future SM-2 swap (the seam makes it a single-module change if ever needed) — not built.
- Calibrated band/threshold *values* → `pedagogy-pass` (deferred); ship defaults.

## Notes for /interview
Likely fine to go to /deep-plan fairly directly — the spaced-repetition decision is fully locked (algorithm, seam, outcome shape, demote magnitude, persisted fields) and the three generators reuse the stage-02 contract validated by fruit-equations. A brief /interview is only warranted to pin the **shipped default band intervals + thresholds** and each generator's **`params`/`difficultyHooks` shapes**, and to confirm the multi-slot fraction decomposition aligns with stage 03. Keep the scheduler/diagnostic-loop boundary (band-demotion vs un-mastering) explicit and structurally separate.
