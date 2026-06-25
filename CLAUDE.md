# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**Pre-implementation — architecture complete, no code yet.** The repo contains the product/architecture brief (`tyama-architect-brief-en.md`) and a finished architecture-decision record under `.ai-arch/`. There is no `package.json`, app scaffold, or build tooling yet, and it is not a git repo. When you scaffold the app (start with stage 01 — see below), update this file with the real build/test/lint commands.

**Two sources of truth, in order:** `.ai-arch/` is the *decided architecture* and the more current, more specific record — read it first. The brief is the original product vision the architecture was derived from. They agree; where granularity differs, `.ai-arch/` wins.

## The `.ai-arch/` architecture repository (read this before implementing)

A full architecture pass (the `/architector:*` workflow) ran over the brief and produced a committed decision record. Do not re-derive decisions that already live here, and do not relitigate a `ready`/`decided` node without explicit user agreement.

- **`.ai-arch/index.json`** — the spine. An array of `nodes` (architecture concerns) each with a `maturity` (`raw-idea` → `explored` → `decided` → `ready`) and a dense `summary` of what was locked and *why* (including rejected alternatives). Plus a `connections` graph (dependency / shared-concern / resolved edges between nodes) and a `sessions` log narrating how each decision was reached. This is the highest-density source — when you need the rationale behind a constraint, search the relevant node's `summary` and the `sessions` entries.
- **`.ai-arch/ideas/*.md`** — one file per architecture node (e.g. `local-persistence.md`, `task-generation.md`, `diagnostic-loop.md`), the long-form version of its `index.json` summary.
- **`.ai-arch/feature-briefs/01..07-*.md`** — the implementation handoff: the 16 MVP-ready nodes grouped into **7 build stages**. Each brief states the goal, what to build, locked decisions (do-not-relitigate), and explicit *Open Technical Questions* left for implementation-time. **Open the relevant brief before writing code for a stage.**
- **`.ai-arch/todo-list.md`** — the stage dependency DAG, status tracker, and repo-wide cross-stage invariants. Update the Status column as stages complete.
- **`.ai-arch/project-context.md`** — the distilled brief (product, persona, north star, locked constraints).

### Implementation stages (from `todo-list.md`)

Critical path **01 → 02 → 03 → 04 → 05 → 07**; stage **06** (shell) parallelizes after 04. Each stage = one or more runs of the implementation workflow (`/interview` → `/deep-plan` → `/implement` → `/final-check`).

1. **Foundation & Persistence** — Expo scaffold (managed + prebuild); `expo-sqlite` system of record; truth-model; node-identity/migration spine; hot-state `settings` seam.
2. **Graph Engine & Generation Core** — `loadGraph()` + generator contract/registry + one generator (fruit-equations) end-to-end on a labelled fixture.
3. **Answer Pipeline** — constrained-entry widgets + locale-numeric-parsing + step-level checking.
4. **Diagnostic Loop & Mastery Gates** — `failedStep` → prerequisite routing; graded `masteryLevel`.
5. **Spaced Repetition & full generator content** — banded scheduler + remaining 3 generators.
6. **Motivation / Explanation / Presentation Shell** — gamification rings, `ExplanationProvider`, i18n-strings, theme/persona.
7. **Onboarding & Offline-Resilience Polish** — cross-cutting; realizes onboarding flow + brief §14 phase 5.

**Deferred, off the critical path:** `pedagogy-pass` (the authored graph asset — atom-catalog content + calibrated thresholds/bands; swaps in via `loadGraph()` + `difficultyHooks` as config-as-data with no code change), `cosmetic-companion` (fast-follow), `social-deferred` (identity model laid in by stage 01, UI out of MVP).

### Repo-wide invariants that cross every stage (from `todo-list.md`)

- **One canonical-number standard, load-bearing across 02↔03.** The generator's `expected` and the checker's `normalize` must reference *one documented* standard for decimal form / ordering / lowest-terms. A divergence silently marks *correct* answers wrong — the single worst failure. Pin it jointly when planning stage 02.
- **Anti-shame is an invariant, not a stage.** No UI state ever shows something subtracted — only gained or not-yet-gained. Treat any "wrong / red / ✗ / buzzer / shake / locked / penalty / subtracted" surface as a defect in *every* stage.
- **Seam discipline is repo-wide.** Pure deterministic logic behind a thin contract over a dumb persistence substrate: `loadGraph()`, the generator registry, `ExplanationProvider`, the spaced-repetition scheduler, the hot-state `settings` repository. Extend this pattern; don't introduce a competing one.
- **Two independent version axes:** DB-schema version (stage 01) vs `graphVersion` graph-content version (stage 02). Never conflate; they migrate on separate clocks.
- **Config-as-data, shipped-defaults-now.** Stages 02 (difficulty bands), 04 (mastery thresholds), 06 (curated path) ship working defaults so the build is never blocked; `pedagogy-pass` calibrates them later as data. Build the *mechanism* + *defaults*; never hardcode values into the binary.

## What Tyama is

A **mental-math fluency trainer** (React Native / Expo, offline-first, no backend in the MVP) for adults (16+) with math anxiety and weak fundamentals. The central insight that shapes the whole architecture: the product's value is **diagnosing exactly which foundational skill the user fails on and routing them back to it** — not merely "serving tasks." The primary success metric is the disappearance of fear/avoidance, so every decision (especially error handling) is subordinate to *not shaming the learner*.

## Locked architectural decisions

These are committed in the brief (§12) and must not be relitigated without explicit user agreement:

1. **Skill graph is a DAG, stored as data/config — never hardcoded.** Nodes are *skill atoms* (e.g. "multiplication tables", "equivalent fractions"), edges are prerequisites. The graph is what makes precise diagnostic routing possible (route to the *cause* skill, not the symptom).
2. **Task generation is procedural code, built backward from a pre-chosen answer.** No LLM and no stored task bank for the math core — this guarantees correctness, a unique solution, free deterministic checking, and known intermediate steps. Generators live behind a single contract in a registry; a new level = a new module implementing the contract + a graph node.
3. **Checking is step-level, not binary.** The solution decomposes into ordered steps; on error the system identifies *which step* broke. This `failedStep` is the input to diagnostic routing. This is the most expensive decision and is taken deliberately up front.
4. **Pedagogy = CPA + mastery gates + spaced repetition + diagnostic loop.**
   - **CPA** (Concrete → Pictorial → Abstract): every atom exists at three representation levels; the task model **must carry representation level as a parameter**. The "fruits instead of numbers" idea is the pictorial bridge.
   - **Mastery gates**: advance only after reaching *both* accuracy and speed, not a single correct answer.
   - **No punishment/shame**: an error is a routing signal, not a loss event.
5. **Explanations via `ExplanationProvider` seam.** MVP `ClipboardPromptProvider` renders a prompt *deterministically from a template* (fully offline, no LLM even to build it) and copies it to the clipboard for the user to paste into their own chat app. Future `ApiExplanationProvider` reuses the **identical `context`** — only the transport changes. Do not bake LLM calls into the core.
6. **Social is deferred but laid in now**: model a user identity and an **activity-event stream** (node mastered, streak, milestone as events). The future social layer is a new *consumer* of those events, not a core rewrite. Comparison/leaderboards are off by default (they amplify the anxiety the app exists to reduce).

## The generator contract (extensibility spine)

Indicative shape — the exact form is an architecture decision, but keep this structure:

```
generate(difficulty: DifficultyParams) → {
  problem,         // statement, at a CPA representation level
  solution,        // the answer (constructed, hence known-correct)
  steps,           // ordered solution steps (input to step-level checking)
  representation,  // concrete | pictorial | abstract
  skillNode        // which graph node this belongs to
}
```

`ExplanationProvider.explain(context)` where `context = { problem, studentAnswer, correctAnswer, method, steps, failedStep, skillNode, language }`.

## Hard rule: language-neutral core

The deterministic core (graph, generators, checker) emits **structured data only — never localized strings**. Language lives solely in presentation and explanation layers. Model three *separate* language fields even though the MVP binds them to one selection: **UI language**, **content language** (problem text/flavor), **explanation language**.

**Number-formatting is a correctness trap, not cosmetics.** Decimal separators differ (UA/EU `3,5` vs EN `3.5`) and this affects *both display AND answer parsing in step-level checking*. The answer parser must be locale-aware (or explicitly normalize). Getting this wrong marks correct answers wrong — fatal for an anxious learner. Test decimal-separator parsing explicitly; do not rely on locale auto-detection alone.

## MVP boundaries

**In:** skill graph (number sense + first bridges to algebra); 3–5 generators (sticks/number bonds, multiplication, fruit equations, fraction simplification); step-level checking; mastery gates + basic spaced repetition; diagnostic routing; light motivation (per-node progress rings, streak, XP); `ClipboardPromptProvider`; offline-first local persistence; Ukrainian UI with i18n scaffolding.

**Out:** any runtime LLM integration; backend/proxy/server accounts; social/leaderboards; the cosmetic companion (fast-follow); advanced math (logs, integrals, trig).

## Open questions — now mostly resolved in `.ai-arch/`

The brief §13 open questions have since been *decided* (see the matching `index.json` node summaries): local DB = **`expo-sqlite` only**; **semver `graphVersion` in-asset** as the migration key; `DifficultyParams` = **hybrid envelope** (universal `representationLevel`+`elicitFromMastery` over an opaque per-generator `params`); **unified `steps[]`** with one generic checking engine; routing = **mastery-gated backward DAG traversal, no rules layer**; generators **static (no OTA)**, graph **OTA-capable** behind `loadGraph()`; thresholds/bands = **config-as-data**; spaced repetition = **banded in-house intervals, not SM-2**; persona = **enum bundle**, dark/light orthogonal.

What remains open is **implementation shape**, not architecture — each feature brief's *Open Technical Questions* section lists what its stage must decide at `/interview`/`/deep-plan` time (exact SQLite schema, migration-runner mechanics, repository method surfaces, etc.). Confirm those with the user during planning; do not reopen the locked architecture.

## Build order

Superseded by the **7-stage plan in `.ai-arch/todo-list.md`** (summarized under "Implementation stages" above). Start at stage 01. The brief §14 phased order is the ancestor of this plan; the stages are the authoritative version.
