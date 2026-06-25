# Idea: Mastery Gates
_Created: 2026-06-15_
_Slug: mastery-gates_

## Description
Advancement to the next skill node happens only after reaching **both accuracy and speed** (true automaticity), not after a single correct answer. Mastery is the gate between graph nodes and also the trigger that drives scaffolding fade (steps stop being elicited as mastery rises).

**Decided mechanism:** a single graded `masteryLevel` scalar per `(node, representationLevel)` slice (plus an aggregate), computed from accuracy + speed and measured **along the CPA trajectory** (abstract automaticity = full scale; concrete success = low-but-nonzero, pictorial = mid). The inter-node **gate** sits high on this scalar (abstract zone) = `masteryLevel ≥ masteryThreshold`; **scaffolding-fade** cut-points sit lower on the *same* scalar (concrete → full rail, pictorial → key steps, abstract → `finalOnly`); **gamification rings** read the same scalar. One scalar, multiple projections — no independent progress signals. Thresholds are config-as-data (per-node via `difficultyHooks`), with the **speed dimension acting as an up-force that raises `masteryLevel` but never zeroes/evicts a correct-but-slow learner** — speed is a reward, never a turnstile.

## Priority
core

## Maturity
ready

## Notes
- Brief §4.2, part of locked decision #5 (pedagogy).
- **Q6 RESOLVED (2026-06-16 /decide):** thresholds are config-as-data — a global default overridable **per skill-node** via the graph's `difficultyHooks`; calibration owned by the **deferred pedagogy pass** (same owner as the atom catalog) with **shipped defaults** so the build isn't blocked. The speed threshold is **per-atom, never a global absolute (ms)** — multiplication-table speed ≠ fraction-simplification speed.
- **~~Open thread (decided-not-ready)~~ → RESOLVED 2026-06-24:** the pedagogy-calibrated *threshold values* thread was **extracted to [[pedagogy-pass]]** (the structural "pedagogy-gate" ruling). They are calibration data in each node's `difficultyHooks`, not unresolved architecture; shipped defaults **are** the MVP spec, pedagogy tuning is post-MVP refinement owned there. Mechanism + defaults fully specify the node → now `ready`.
- Drives the `elicitFromMastery` mechanism in [[difficulty-model]] / [[constrained-answer-entry]]: cut-points on the single `masteryLevel` scalar — concrete zone = full rail, pictorial zone = key steps, abstract zone = `finalOnly` speed drill.
- Measurement window: rolling last-N evaluated **within the current representation level** (per-`(node, representationLevel)`), then aggregated into the single scalar — concrete and abstract attempts are never mixed in one window.
- Mastery state must persist — single `masteryLevel` per `(node, representationLevel)` slice + aggregate, see [[local-persistence]] (hybrid materialized truth-model) and the mastery rings in [[gamification]].

## Connections
_Mapped 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[local-persistence]] — mastery state persisted here
- ← [[pedagogy-pass]] — supplies the per-node `masteryThreshold` + per-atom speed values in `difficultyHooks` (replaces shipped defaults; config-as-data, off the critical path)

**Blocks (→):**
- → [[spaced-repetition]] — only mastered nodes enter the queue
- → [[difficulty-model]] — rising mastery fades scaffolding (elicitFromMastery)
- → [[gamification]] — mastery state drives the rings

**Shared concerns:**
- [[difficulty-model]] — elicitFromMastery / scaffolding fade: authored by difficulty, triggered by mastery
- [[constrained-answer-entry]] — elicited step count rendered per mastery level
- [[activity-event-stream]] — node-mastered / streak events produced here

## Decision
_Decided: 2026-06-16_

### What Was Decided
A single graded **`masteryLevel` scalar** per `(node, representationLevel)` slice (plus an aggregate), computed from **accuracy + speed**, is the one source of "how far along" a learner is on an atom. Three projections read it at different cut-points:
- **Inter-node gate** — `masteryLevel ≥ masteryThreshold`, with the threshold sitting **high on the scalar (abstract zone)** so gating means abstract-level automaticity.
- **Scaffolding fade** (`elicitFromMastery`) — cut-points lower on the *same* scalar: concrete zone → novice full rail; pictorial zone → key steps; abstract zone → `finalOnly` speed drill.
- **Gamification rings** — render the same scalar, no independent progress signal.

`masteryLevel` is measured **along the CPA trajectory** (the scalar takes representation level as an input): concrete success → low-but-nonzero, pictorial → mid, abstract accuracy+speed → full scale. The measurement window is a rolling last-N evaluated **within the current representation level**, then aggregated.

Thresholds are **config-as-data**: a global default, overridable **per skill-node** via the graph's `difficultyHooks`, calibrated by the deferred pedagogy pass with shipped defaults. The **speed threshold is per-atom**, never a global ms absolute.

**North-star guardrail:** the speed dimension is an **up-force** — it *raises* `masteryLevel` (reward for automaticity) but **correct-but-slow never zeroes, blocks, or evicts**. It holds the learner at the growing stage with continued practice; "correct but slow" always has a forward path through repetition, never a dead wall. Speed is upward pull, not a turnstile.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Binary mastered/not | Forces scaffolding-fade and rings to each carry their own progress signal → three "how far along" sources that can disagree; violates the single-truth discipline held everywhere else (dual-write truth-model, pure-function seams). |
| Compute `masteryLevel` from the abstract level *alone* | Leaves scaffolding-fade with nothing to stand on during early concrete/pictorial work — exactly when a novice most needs the rail. Resolved by making the scalar run along the whole CPA trajectory with abstract = full scale. |
| One rolling window mixing all representation levels | Blurs the very signal the gate and fade stand on; window is per-`(node, representationLevel)` instead. |
| Hardcoded thresholds | Recalibration = code change + release; can't tune per-atom. Config-as-data via `difficultyHooks` chosen instead, consistent with "graph is data, never hardcoded" (#1). |
| Global absolute speed gate (median time ≤ T) | Blocks a learner who *knows* the material but panics under time pressure — amplifying the exact fear the product treats. Becomes "decay-in-costume" at the mastery-model level (the same failure mode rejected for the companion). Speed made an up-force instead. |

### Rationale
The product exists to close a fluency gap for anxious learners, and speed under pressure is the first thing anxiety breaks — so the speed dimension had to reward automaticity without ever becoming a wall. A single graded scalar keeps the gate, the scaffolding rail, and the visible rings in agreement by construction, matching the seam/single-truth discipline used across the rest of the architecture. Measuring along the CPA trajectory (rather than abstract-only) is what lets one scalar serve both the high gate and the low fade cut-points. Deferring the *values* to pedagogy while locking the *mechanism* mirrors the skill-graph decision (mechanism locked, catalog content deferred) and keeps the build unblocked via shipped defaults.

### Implications
- **[[spaced-repetition]]** (already `ready`): its promised speed-aware `reviewOutcome` is now concretely defined — speed is a first-class input to `masteryLevel`, not a boolean. Only nodes past `masteryThreshold` enter the repetition queue. No change to that node's locked decision.
- **[[difficulty-model]]** / **[[constrained-answer-entry]]**: `elicitFromMastery` cut-points are positions on the single scalar; the shared scaffolding-fade mechanism is now fully specified (concrete/pictorial/abstract zones).
- **[[local-persistence]]**: persists `masteryLevel` per `(node, representationLevel)` slice + aggregate, consistent with the hybrid materialized truth-model.
- **[[gamification]]**: rings read the same scalar — no independent progress signal to maintain.
- **[[skill-graph]]**: per-node threshold overrides live in `difficultyHooks`; the pedagogy pass that owns catalog content also owns threshold calibration.

## History
- 2026-06-15 /architector:new — advance only on accuracy AND speed; gate also drives scaffolding fade. Threshold values and calibration ownership are open.
- 2026-06-16 /architector:decide — locked the mastery model: ONE graded `masteryLevel` scalar (accuracy+speed) measured along the CPA trajectory (abstract=full scale), with the inter-node gate, scaffolding-fade cut-points, and rings all projections of that single scalar (rejected binary → avoids three disagreeing progress signals; rejected abstract-only → leaves early fade nothing to stand on). Thresholds = config-as-data per-node via `difficultyHooks`, per-atom speed (never global ms), calibrated by the deferred pedagogy pass with shipped defaults (Q6 resolved). North-star guardrail: speed is an UP-FORCE — correct-but-slow holds at growing stage, never zeroes/blocks/evicts (median-time gate rejected as decay-in-costume that amplifies the anxiety the product treats). → decided NOT ready (open thread: pedagogy-calibrated threshold *values*, parallel to skill-graph's catalog content).
- 2026-06-24 /architector:decide — `decided → ready`. The structural "pedagogy-gate" ruling **extracted the threshold-values thread to the new [[pedagogy-pass]] node** (calibration data in `difficultyHooks`, not unresolved architecture). Shipped defaults **are** the MVP spec; pedagogy tuning is post-MVP refinement owned there. Mechanism + defaults fully specify the node, so it is now `ready`. No change to the locked decision.
