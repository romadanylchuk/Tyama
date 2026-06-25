# Feature Brief: Onboarding & Offline-Resilience Polish
_Stage: 07_
_Created: 2026-06-24 via /architector:finalize_
_Arch nodes covered: (cross-cutting — no exclusive node; realizes presentation-theme D4 onboarding + the brief's §14 phase-5 polish)_

## Goal
Assemble the 16+ onboarding flow that ties together everything built in stages 01–06, then harden the app into a shippable MVP: offline resilience, persistence durability, locale-decimal edge-case robustness, and onboarding that is subordinate to the north star. This is an integration + hardening phase, not new architecture — it makes the assembled system trustworthy for an anxious learner.

## Context
- **This stage covers no exclusive arch node.** It realizes presentation-theme's **D4 onboarding decision** (which deliberately owns *none* of the three concerns it orchestrates) and the brief's §14 phase-5 "polish: offline resilience, persistence, 16+ onboarding, locale-aware input." It is intentionally last because it depends on all the owners it wires together being built.
- **Onboarding is a separate flow orchestrating three existing owners and owning none of them:** (a) diagnostic placement → entry difficulty (pedagogy: diagnostic-loop/difficulty-model, stages 02/04); (b) the three language fields → i18n (stage 06); (c) persona → theme (stage 06).
- **Offline-first is a whole-core constraint** (tech-stack): generation, checking, progress, and explanation-as-prompt all work with no network. This stage proves it under adverse conditions (app kill mid-write, no connectivity, cold start).

## What Needs to Be Built
1. **The onboarding flow:**
   - A separate flow (distinct from runtime theming) that runs **diagnostic placement**, sets the **three language fields**, and sets the **persona** — delegating each to its stage-02/04/06 owner, owning none.
   - **Partially skippable, subordinate to the north star:** persona and language have sensible defaults and **skip cleanly**; **diagnostic placement may be *shortened* but never nulled** — nulling defaults entry difficulty and risks starting an anxious learner too high (frustration) or too low (condescension).
   - **If shortened/skipped: start conservatively low and calibrate upward fast** — starting low and rising is non-shaming; starting high and failing is shaming. The skip policy itself is subordinate to "I'll give it a try."
   - Writes its outputs (entry difficulty coordinate, languages, persona enum) through the stage-01 repository seams.
2. **Offline-resilience + persistence-durability hardening:**
   - Verify the full loop (generate → answer → check → route → persist → explain-to-clipboard) works with no network, on cold start, and after app kill mid-session.
   - Exercise the **atomic milestone gate** under interruption — a killed process must never leave milestone state without its durable event (or vice versa). Verify firehose loss-under-compaction is graceful.
   - Verify JSON export/import round-trips and protects streaks (north-star).
   - Exercise the node-identity migration path (a `graphVersion` bump → split/merge/deprecate mapping applied without corrupting existing mastery).
3. **Locale-aware-input hardening:**
   - Drive the stage-03 locale test matrix to exhaustion across UA/EN/EU on **both real platforms** (Hermes/Android ICU variance is the named risk) — confirm no correct answer is ever marked wrong, and `ParseError` always yields a gentle re-prompt rather than a `failedStep`.
4. **16+ polish pass:**
   - Confirm the anti-shame invariant + derived error-feedback spec hold end-to-end in real flows (error moment, streak-miss, locked-node rendering, staged-descent framing, register completeness).
   - Real-device testing on iOS + Android (the author tests on both).

## Dependencies
- **Requires:** 01–06 (all of them — onboarding orchestrates stage-02/04/06 owners; hardening exercises every prior stage).
- **Enables:** MVP ship. (Deferred fast-follows — cosmetic-companion, deep-linking, `ApiExplanationProvider`, social — build on this base without a core rewrite.)

## Key Decisions Already Made
- **Onboarding orchestrates, owns nothing** — merging it into the theme would couple three independently-owned concerns into the skin.
- **Placement is shortenable, never nullable; skip starts low-and-rising** — fully nulling placement defaults entry difficulty and can start an anxious learner at a shaming level. Both are direct north-star consequences.
- **Offline-first across the whole core** — no network anywhere in the MVP loop.
- **JSON export/import is the only backup (#14)** — no sync backend.

## Open Technical Questions
- The concrete onboarding screen sequence + the "shortened placement" UX (how many probes, how the low-and-calibrate-up curve is driven by stage-04 placement).
- The durability test plan: which interruption points to simulate, how to assert the atomic gate held.
- Whether any first-run defaults (persona, language) need persistence-seam additions beyond what stage 01 built.
- Real-device test matrix specifics (OS versions, locales) for the locale-parsing exhaustion pass.

## Out of Scope for This Stage
- Any new architecture or new arch node — this is integration + hardening only.
- The cosmetic companion, deep-linking, `ApiExplanationProvider`, social (all deferred fast-follows).
- The authored pedagogy catalog / calibrated values → `pedagogy-pass` (the MVP ships on the labelled fixture + shipped defaults; this stage does not author content).

## Notes for /interview
Go through /interview to define the **onboarding screen sequence and the shortened-placement UX**, and to agree a concrete **durability/offline test plan** (the interruption points that prove the atomic milestone gate, the locale exhaustion matrix on both platforms). Much of this stage is verification against criteria already fixed in earlier stages, so /deep-plan can lean on those briefs. The hard rule to enforce throughout: **no correct answer is ever marked wrong, and no formatting slip or streak-miss is ever scored against the learner** — this stage is the last line of defense for the north star before ship.
