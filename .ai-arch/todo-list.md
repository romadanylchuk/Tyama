# Implementation Todo List — Tyama (Mental Math Fluency App)
_Generated: 2026-06-24 via /architector:finalize_
_Source: .ai-arch/feature-briefs/_

## Stages

| # | Stage | Brief | Depends On | Status |
|---|-------|-------|------------|--------|
| 01 | Foundation & Persistence Substrate | [01-foundation-persistence.md](feature-briefs/01-foundation-persistence.md) | — | **done** (2026-06-25) |
| 02 | Skill Graph Engine & Generation Core | [02-graph-engine-generation-core.md](feature-briefs/02-graph-engine-generation-core.md) | 01 | not started |
| 03 | Answer Pipeline (Input · Locale · Checking) | [03-answer-pipeline.md](feature-briefs/03-answer-pipeline.md) | 02 | not started |
| 04 | Diagnostic Loop & Mastery Gates | [04-diagnostic-loop-mastery.md](feature-briefs/04-diagnostic-loop-mastery.md) | 02, 03 | not started |
| 05 | Spaced Repetition & Full Generator Content | [05-repetition-generator-content.md](feature-briefs/05-repetition-generator-content.md) | 02, 03, 04 | not started |
| 06 | Motivation, Explanation & Presentation Shell | [06-motivation-explanation-shell.md](feature-briefs/06-motivation-explanation-shell.md) | 01, 03, 04 | not started |
| 07 | Onboarding & Offline-Resilience Polish | [07-onboarding-polish.md](feature-briefs/07-onboarding-polish.md) | 01–06 | not started |

### Dependency shape
```
01 ─┬─► 02 ─┬─► 03 ─┬─► 04 ─┬─► 05 ─┐
    │       │       │       │       ├─► 07
    └───────┴───────┴───────┴─► 06 ─┘
```
Critical path: **01 → 02 → 03 → 04 → 05 → 07**. Stage 06 (shell) depends on 01/03/04 and can be built in parallel with 05 once 04 is done. Stage 07 needs everything.

## Deferred (not in this todo list)
- **pedagogy-pass** — the authored graph asset (atom catalog content + calibrated mastery thresholds + difficulty band values + curated-path sequence). Off the critical path *by construction*: it swaps in via the `loadGraph()` seam and `difficultyHooks` as **config-as-data with no code change**, replacing the labelled smoke-test fixture and shipped defaults that stages 02/04/05/06 build against. Can be authored in parallel and dropped in any time. Confirmed kept deferred (finalize gate, 2026-06-24).
- **cosmetic-companion** — fast-follow. Model is decided (pure consumer of the durable event class); art pipeline (Rive/Lottie/sprites) + on-screen placement deferred. Stage 06 should leave layout room (noted in its brief).
- **social-deferred** — out of MVP. Identity model (stable opaque `userId`, no account fields) is laid in by stage 01; future social UI is a new consumer of the activity-event-stream durable class, no core rewrite.

## How to Use This List
Each stage maps to one (or more) runs of the implementation workflow:
1. Open the feature brief for the stage.
2. Run `/interview` (every stage here has open implementation-shape questions — see each brief's "Notes for /interview") then `/deep-plan`; or `/deep-plan` directly for the parts already well-specified.
3. Complete the workflow: `/deep-plan` → `/implement` → `/final-check`.
4. Mark the stage **done** in the Status column above.
5. Move to the next stage (respect the dependency shape — 06 can overlap 05).

## Notes / cross-stage concerns
- **The one canonical number standard is load-bearing across 02 ↔ 03.** The generator's `expected` (stage 02) and the checker's `normalize` (stage 03) must reference **one documented canonical standard** for decimal form / ordering / lowest-terms. A divergence silently marks *correct* answers wrong — the product's single worst failure. Pin it jointly when planning stage 02, before stage 03 builds the checker.
- **The anti-shame north star is a cross-cutting invariant, not a stage.** "No UI state ever shows something subtracted — only gained or not-yet-gained" originates in gamification (stage 06) but constrains diagnostic-loop's staged descent + anti-loop (04), spaced-repetition's one-band-demote (05), mastery-gates' speed-as-up-force (04), locale-parsing's `ParseError`-≠-`failedStep` (03), and the register-completeness gate (06). Treat any "wrong/red/subtracted/locked/penalty" surface as a defect in every stage.
- **Seam discipline is repo-wide.** Pure deterministic logic behind a thin contract, persistence as a dumb substrate: `loadGraph()`, the generator registry, `ExplanationProvider`, the spaced-repetition scheduler, and the hot-state `settings` repository all follow it. New code should extend this pattern, not introduce a competing one.
- **Two independent version axes:** DB-schema version (stage 01) vs `graphVersion` graph-content version (stage 02). Never conflate; they migrate on separate clocks. A `graphVersion` bump triggers the #15 split/merge/deprecate mastery-migration chain.
- **Config-as-data, shipped-defaults-now pattern:** stages 02 (difficulty bands), 04 (mastery thresholds), 06 (curated path) all ship working defaults so the build is never blocked; `pedagogy-pass` calibrates them later as data. Build the *mechanism* and the *defaults*; never hardcode the values into the binary.
- **Cost / platform reality:** stage 01's `expo-sqlite` ends Expo Go → a dev build + $99/EAS is required from stage 01 onward. Author tests on real iOS + Android (especially the stage-03/07 locale matrix — Hermes/Android ICU variance is the named risk).
- **Maturity bookkeeping (2026-06-24):** `tech-stack` and `activity-event-stream` were advanced `decided → ready` at the finalize gate — both had no open threads remaining (their only blockers were closed elsewhere). Recorded in `index.json` + the two node files.
