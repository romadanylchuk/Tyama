# Feature Brief: Diagnostic Loop & Mastery Gates
_Stage: 04_
_Created: 2026-06-24 via /architector:finalize_
_Arch nodes covered: diagnostic-loop, mastery-gates_

## Goal
Build the product's core differentiator: turn a `failedStep` into a precise diagnosis of *which foundational skill is missing* and route the learner there — "diagnose the cause, not the symptom." This requires the mastery model it reads from: a single graded `masteryLevel` scalar per `(node, representationLevel)` computed from accuracy + speed, measured along the CPA trajectory. Together these are the diagnostic loop the whole domain model exists to support.

## Context
- **Routing = mastery-gated backward traversal over the skill-graph, NO rules layer** (Q4). Entry = the single first-break `failedStep.skillNode` from stage 03. Descend along `prerequisites` edges into *unmastered* atoms; stop at the **deepest unmastered prerequisite** (route there); if all prerequisites are mastered, the symptom atom itself is the target (a local gap, not a missing foundation).
- **Pure graph + mastery-state traversal — never a parallel rules table** (that would fork the graph's prerequisite edges into a second source of truth that drifts).
- **Mastery is a single graded scalar, not boolean** (mastery-gates). One `masteryLevel` per `(node, representationLevel)` slice (+ aggregate), from accuracy + speed, measured **along the CPA trajectory** (concrete = low-but-nonzero, pictorial = mid, abstract automaticity = full scale). Three projections read it: the inter-node **gate** (high cut-point, abstract zone), **scaffolding-fade** cut-points (lower on the same scalar), and **gamification rings** (stage 06) — no independent progress signals.
- **Speed is an up-force, never a turnstile** (north-star guardrail). Speed *raises* `masteryLevel`; **correct-but-slow never zeroes, blocks, or evicts** — it holds the learner at the growing stage with continued practice. A median-time hard gate was rejected as "decay-in-costume" that amplifies the exact anxiety the product treats.
- **Thresholds + bands are config-as-data** in each node's `difficultyHooks`, with **shipped defaults** (the MVP spec). Calibrated values are `pedagogy-pass`'s deliverable; speed thresholds are **per-atom, never a global ms absolute**.

## What Needs to Be Built
1. **The `masteryLevel` scalar engine:**
   - One graded scalar per `(node, representationLevel)` slice + an aggregate, computed from **accuracy + speed**, taking representation level as an input (concrete → low-but-nonzero, pictorial → mid, abstract → full scale).
   - **Measurement window = rolling last-N evaluated *within the current representation level***, then aggregated — concrete and abstract attempts are never mixed in one window.
   - Reads thresholds/speed values from `difficultyHooks` (per-node override over a global default), with shipped defaults.
   - Persists via the stage-01 materialized truth-model (per-slice scalar + aggregate).
   - Drives `elicitFromMastery` cut-points: concrete zone → novice full rail; pictorial zone → key steps; abstract zone → `finalOnly` speed drill. (The fade mechanism is *triggered* here; the band *authoring* is difficulty-model/stage 02.)
2. **The diagnostic routing traversal:**
   - **Target:** entry `failedStep.skillNode` → descend into unmastered prerequisites (`masteryLevel < masteryThreshold`) → stop at the deepest unmastered atom → route there; all-mastered ⇒ symptom atom is the target.
   - **Mechanism:** pure traversal over `prerequisites` + a mastery lookup. No failedStep→prereq rules table.
   - **Disambiguation:** when a candidate has ≥2 unmastered prerequisites (two distinct candidate causes, not "two steps back"), rank by stored `masteryLevel` and descend toward the **lowest**; serve a **single gentle probe task** only on a genuine tie / no data.
3. **The four locked edge constraints (the core misbehaves at its costliest points without them):**
   1. **Staged descent, never a teleport (anti-"abyss").** The deepest-unmastered *target* is unchanged, but the *transition* is staged — lead through intermediate nodes as a short sequence, or at minimum frame it as "let's firm up the foundation under this," never "you failed all the way back to here." (Constrains *how* the move is shown; the framing surface is owned by presentation/stage 06, the target by this algorithm.)
   2. **Read the graded scalar, descend toward the weakest.** "Unmastered" = `masteryLevel < masteryThreshold` (never a boolean false flag); an untouched prereq is descended into more aggressively than a just-started (`in-progress`) one.
   3. **Anti-loop short-horizon memory.** If a freshly-routed causal node fails *again*, do NOT re-pin it — descend further, or escalate to ExplanationProvider (stage 06) for a different modality/explanation. Never the same approach twice. (Without this, the most vulnerable user gets the most looping experience.)
   4. **Routing READS mastery, NEVER writes it.** Routing decides only "where to send *now*." Mastery changes are the consequence of subsequent attempts (via this stage's mastery engine) and band shifts (via spaced-repetition, stage 05) — never a side effect of routing.

## Dependencies
- **Requires:** 03 (the single first-break `failedStep.skillNode` — the traversal entry point), 02 (the graph's `prerequisites` edges to walk; `difficultyHooks` thresholds/bands), 01 (mastery state persistence).
- **Enables:** 05 (mastery-gates supplies the speed threshold that makes `reviewOutcome` speed-aware; only nodes past `masteryThreshold` enter the repetition queue), 06 (rings read the `masteryLevel` scalar; the staged-descent framing and anti-loop escalation are rendered by the shell).

## Key Decisions Already Made
- **Backward traversal (not direct-to-symptom, not probe-every-error)** — route to the cause; direct-to-`failedStep` drills the symptom, probe-on-every-error adds friction to an already-charged moment.
- **Pure graph traversal (not a rules table)** — keeps the graph the single prerequisite authority.
- **Mastery-rank disambiguation, probe only on tie/no-data** — resolves the "≥2 candidate causes" caveat without per-error friction.
- **Single graded scalar (not binary, not abstract-only)** — binary forces three disagreeing progress signals; abstract-only leaves early scaffolding-fade nothing to stand on.
- **Speed as up-force, not a median-time gate** — the median-time gate blocks a learner who *knows* the material but panics; rejected as decay-in-costume.
- **Per-`(node, representationLevel)` window** — mixing all levels in one window blurs the signal the gate and fade stand on.
- **Config-as-data thresholds, per-atom speed** — recalibration without a code release; multiplication-table speed ≠ fraction-simplification speed.
- **Read-not-write boundary** with both mastery-gates and spaced-repetition's band demotion — keeps mastery state's single source of truth intact.

## Open Technical Questions
- The exact `masteryLevel` formula combining accuracy + speed (and how representation level scales it) — shipped defaults exist as a spec but the function form needs pinning.
- The rolling-window size N and the per-slice → aggregate combination rule.
- The traversal's concrete data structure + the short-horizon memory representation ("already sent here → change strategy on repeat break").
- The probe-task selection on tie/no-data (which generator/difficulty).
- The escalation handoff contract to ExplanationProvider (what the anti-loop path passes).

## Out of Scope for This Stage
- The visual *framing* of staged descent and the rendered hint — owned by presentation-theme (stage 06); this stage fixes the *target* and emits the signal.
- Spaced-repetition band demotion / scheduling → **stage 05** (the read-not-write boundary is explicit: SR owns within-node band shifts; this stage owns cross-node "where now").
- Gamification rings rendering → **stage 06** (this stage produces the scalar they read).
- Calibrated threshold/band *values* → `pedagogy-pass` (deferred); this stage ships defaults.

## Notes for /interview
A short /interview to pin the **`masteryLevel` formula, the window size N, and the traversal/short-horizon-memory data structures** is worthwhile — the *mechanism* and the *guardrails* are locked, but the concrete math and state shapes are open and feed stages 05/06. Be explicit that the algorithm and its four edge constraints are **non-negotiable** (each is a direct consequence of the no-shame north star) — interview only the implementation. Confirm the read-not-write boundary is structurally enforced (routing has no write path to mastery state).
