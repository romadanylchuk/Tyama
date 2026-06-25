# Feature Brief: Skill Graph Engine & Generation Core
_Stage: 02_
_Created: 2026-06-24 via /architector:finalize_
_Arch nodes covered: skill-graph (engine), task-generation, difficulty-model_

## Goal
Build the domain skeleton: the skill-graph engine (graph-as-data behind a `loadGraph()` seam), the procedural task-generation contract + build-time registry, and the `DifficultyParams` model that feeds generators. Prove it end-to-end with **one** generator (fruit-equations) producing real tasks against a **labelled smoke-test fixture** graph. This is the extensibility spine the whole product rests on — "a new level = a new module implementing the contract + a graph node."

## Context
- **Graph is data/config, never hardcoded** (locked decision #1). Graph = a **bundled, read-only asset** addressed by **human-readable slug IDs** (immutable after release), behind a thin `loadGraph() → GraphDefinition` seam that is OTA-capable later (Expo Updates) but ships **static, no OTA machinery** in MVP.
- **The atom-catalog *content* is deferred to `pedagogy-pass`** (off critical path). This stage builds the **engine** against a **labelled fruit-equations smoke-test fixture** — explicitly "smoke-test fixture, not the MVP catalog." The real catalog later swaps in via `loadGraph()` as a config-as-data change with **no engine change**.
- **Task generation is procedural, backward-from-a-pre-chosen-answer** (decision #3) — guarantees correctness, a unique solution, free deterministic checking, and known intermediate steps. **No LLM, no stored task bank** for the math core.
- **Generators register STATICALLY at build time** (Q5) — answer-judging code must not bypass store review via OTA. Data (graph) is OTA-capable; code (generators) is deliberately not. This is precise risk-profiling, not inconsistency.
- **Strict canonical-form matching, no CAS** (tech-stack D2): each step's `expected` is canonical, and the contract carries a **normalization policy** (lowest terms, fixed ordering, decimal-form policy), not just the value. Alternate written forms are *different skill atoms* — accepting them would blind the diagnostic loop.

## What Needs to Be Built
1. **Graph engine:**
   - `loadGraph() → GraphDefinition` seam loading a static bundled asset.
   - Node schema `{ id (slug), prerequisites (ID[]), representationLevels (supported CPA levels), difficultyHooks }`. Edges live on the consumer node as `prerequisites` and encode **prerequisite dependencies ONLY — never a "next"/progression sequence**.
   - In-asset semver **`graphVersion`** carried as the #15 migration key, orthogonal to the DB-schema version (stage 01).
   - A **labelled smoke-test fixture** subgraph (the fruit-equations branch) — real data to build against, marked "not the MVP catalog."
2. **Generator contract + registry:**
   - Contract: `generate(difficulty: DifficultyParams) → { problem, solution, steps, representation, skillNode }`.
   - Per-step spec: `steps[]: { prompt, inputMode, expected (canonical), skillNode, elicitFromMastery }` — an **ordered array with semantic order** (the sequence checking walks and scaffolding-fade elicits from). Each step carries the **normalization policy** (incl. an explicit **decimal-form term** — leading/trailing-zero policy — that must match what the generator applied to `expected`).
   - A **build-time plugin registry** keyed to graph slug node IDs.
   - **Graceful degradation (hard requirement):** the registry must answer "no generator for this slug" **without crashing** (an OTA graph update can add a node whose generator isn't in the installed build) — such a node renders "coming soon" / is excluded from the active queue.
3. **`DifficultyParams` model (hybrid envelope):**
   - **Universal envelope:** `representationLevel` (concrete | pictorial | abstract) + `elicitFromMastery` (scaffolding-fade cut-point) — both projections of the single `masteryLevel` scalar (mastery-gates, stage 04).
   - **Opaque per-generator `params` payload** — the numeric-range axis (sticks: `{count, bond}`; fraction: `{numer, denom, reducibility}`; fruit-equations: `{unknowns, range, negatives}`). The deterministic core never inspects it; only the owning generator interprets it.
   - **Smooth progression = monotone coordinate → ordered per-node bands in `difficultyHooks`** (config-as-data). The generator mechanically instantiates a band into concrete numbers; it does **not** own the curve. **Shipped default bands** unblock the build; calibrated values are `pedagogy-pass`'s deliverable.
4. **One generator end-to-end: fruit-equations** — `tokens`/`number`, pictorial→abstract, multi-step — producing valid `{ problem, solution, steps, representation, skillNode }` against the fixture graph, with a canonical `expected` per step.

## Dependencies
- **Requires:** 01 (stable node IDs to register generators against; the #15 migration spine; `graphVersion` coordinates with the DB-schema axis).
- **Enables:** 03 (emits the ordered `steps[]` + `inputMode` consumed by checking + widgets), 04 (graph + difficulty for routing/gates), 05 (the contract the remaining 3 generators implement).

## Key Decisions Already Made
- **Slug IDs over UUID** — all three consumers (generator registration, diagnostic routing, the human-authored migration table) want readable IDs; slug collisions surface at build time. Immutable after release (rename = deprecate + add + map).
- **Config/state boundary (cornerstone)** — graph = read-only asset; progress references node IDs only, never copies a node.
- **`graphVersion` as a migration key**, not a label — orthogonal to DB-schema version.
- **Static bundled asset behind an OTA-capable loader seam** — static now, loader-seam yes, OTA machinery no.
- **Prerequisite-only edges** — "where to next" is a separate gamification/UI decision, never a graph edge property.
- **Static build-time generator registration, no OTA** — plus the "no generator for slug → no crash" registry requirement.
- **MVP generator set = 4 contract validators** (not 4 topics), chosen to stretch the contract across all 5 inputModes / both CPA ends / speed / multi-step: sticks-number-bonds, multiplication, fruit-equations, fraction-**simplification**. (Only fruit-equations is built in *this* stage; the rest are stage 05.)
- **`DifficultyParams` = hybrid envelope + config-as-data bands** — fully-universal struct rejected (bloated union); fully-per-generator rejected (breaks single-contract uniformity); imperative in-code curve rejected (moves calibration into the binary).

## Open Technical Questions
- Concrete TypeScript types for `GraphDefinition`, the node schema, `DifficultyParams` (envelope + opaque `params`), and the `steps[]` spec.
- The registry mechanism (a static map keyed by slug? a decorator/registration call per module?) and exactly how "no generator for slug" surfaces to the node-queue/UI.
- The fixture subgraph's exact nodes/edges/representationLevels for fruit-equations.
- The `monotone coordinate → band` mapping function shape and the shipped-default band values' format in `difficultyHooks`.
- The documented **canonical standard** (decimal form, ordering, lowest-terms) that both the generator's `expected` and the checker's normalize step reference — must be specified jointly with stage 03.

## Out of Scope for This Stage
- The other three generators (sticks-number-bonds, multiplication, fraction-simplification) → **stage 05**.
- The authored atom catalog / real graph content → `pedagogy-pass` (deferred); this stage uses the labelled fixture only.
- Step-level checking, widgets, locale parsing → **stage 03**.
- Mastery scalar computation, routing → **stage 04** (this stage only *defines* `representationLevel`/`elicitFromMastery` as the envelope shape; it does not compute mastery).
- Any OTA loading machinery.

## Notes for /interview
Worth a short /interview to pin the **concrete type definitions** and the **registry mechanism** before /deep-plan, since downstream stages (03, 05) bind directly to these shapes and a change later is expensive. Also resolve, jointly with stage 03's owner, the **one documented canonical standard** for number form so `expected` and the checker's `normalize` cannot diverge (a divergence here silently fails *correct* answers — the product's worst failure). The architecture (procedural/backward generation, static registry, slug IDs, hybrid envelope, deferred catalog) is **locked — do not relitigate**.
