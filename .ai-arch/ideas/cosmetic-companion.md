# Idea: Cosmetic Companion
_Created: 2026-06-15_
_Slug: cosmetic-companion_

## Description
An optional cosmetic companion that **grows from success but never suffers from inactivity** — a positive-only motivation flourish. Explicitly a **fast-follow, not an MVP blocker**, and explicitly *not* a tamagotchi: no guilt mechanics, no "character dies if you don't check in." Built correctly it is a **pure consumer of the [[activity-event-stream]]**.

**Committed model (decided 2026-06-23):**
- **Two-layer behaviour.** Layer 1 = irreversible milestone stages (each unlocked by a first-occurrence achievement event; stages never regress, absence removes nothing). Layer 2 = ephemeral, stateless per-success reactions (hop/sparkle) that never accumulate into losable state. Together: positive-only *by construction* + "alive between milestones" with zero decayable state.
- **Cold-start.** Stage 0 is complete and likeable on its own — never an empty vessel; milestones *add*, never *fix*.
- **Introduction.** Present-by-default from first launch (not an off-by-default opt-in), minimal, never competing with the skill-map for screen real estate; one-tap dignity-of-exit with a re-enable path in settings; first greeting fires on the **first success event**, not on app launch.
- **Engineering seam.** Pure consumer owning **no state of record**; derived stage = a projection over the **durable milestone-set** (not the raw event log), so derivation reads compaction-immune data.
- **Deferred, on purpose:** the **art/animation pipeline** (Rive vs Lottie vs sprites) and the **exact on-screen placement** remain open — both are art-production resourcing / downstream-layout calls with no MVP forcing function, so the node is `decided` but **not `ready`**.

## Priority
deferred

## Decision
_Decided: 2026-06-23_

### What Was Decided
Lock the exploration's full behavioural and architectural model as the committed design; keep the two genuinely-open sub-decisions (art pipeline, placement) explicitly deferred. The node advances `explored → decided` (not `ready` — open questions remain).

**Locked:**
1. **Two-layer model** — irreversible milestone stages (Layer 1) + ephemeral stateless per-success reactions (Layer 2).
2. **Cold-start** — Stage 0 complete-on-its-own; milestones add, never fix.
3. **Introduction** — present-by-default (not opt-in), dignity-of-exit, first greeting on first success event.
4. **Seam** — pure consumer, no state of record; derived stage = projection over the durable milestone-set.

**Deliberately left deferred:** art/animation pipeline (Rive vs Lottie vs sprites) and on-screen placement.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| **Growth: pure-cumulative** | Mathematically safe (never decays) but reads as *inert* — "came back after a month, looks identical." The Layer-2 reactions exist precisely to fill this gap without adding losable state. |
| **Growth: streak-coupled** (downgrades on a broken streak) | Decay in costume. Violates the no-punishment/no-shame constraint (locked decision #2) — the exact anxiety the product exists to reduce. Disqualified by construction, not taste. |
| **Cold-start: empty vessel** ("do something to bring it to life") | A weak/sad initial state is hidden pressure and hidden shame ("you're nobody yet"). Contradicts the north star. |
| **Introduction: off-by-default opt-in toggle** | A toggle ~95% of users never find → paying for art nobody sees. The 16+ "this is infantile" concern is answered by *dignity of exit*, not consent-gating. |
| **Seam: project over the raw event log** | The raw firehose is compaction-eligible and may be truncated; deriving stage from it would make the companion's history fragile. Projecting over the durable milestone-set keeps "owns no state of record" true *and* compaction-immune. |
| **Decide art pipeline / placement now** | No MVP consumer exists yet; deferral here is a real resourcing call (art production is the actual reason this is a fast-follow), and placement is downstream of [[gamification]]'s still-settling skill-map layout. Pinning either now is premature commitment against a moving surface. |

### Rationale
The model decisions are load-bearing *even for a deferred feature*: each one is a direct consequence of the no-shame north star (#2), so getting them wrong later would reintroduce exactly the guilt the product rejects. Locking them now costs nothing and prevents a future "make the companion react to inactivity"-style regression from being treated as an open question. The model was already fully litigated in exploration; this session formalizes it with rationale rather than reopening it.

The two deferred items are deferred *by their nature*, not by indecision: the art pipeline is a content-production/resourcing decision (the real driver of the fast-follow status), and placement depends on a `gamification` surface that is still the visible motivational core the companion must never compete with. Deciding them on their own clock — when the feature is actually scheduled and the skill-map layout is fixed — is the correct sequencing, the same separate-clocks discipline used for `skill-graph`'s catalog content and `local-persistence`'s engine choice.

### Implications
- **No cascade to re-open.** The cross-node contribution this node made (milestone facts must be compaction-immune; two-class event schema) was already absorbed when [[activity-event-stream]] reached `decided` and [[local-persistence]] reached `ready`. The locked seam ("projection over the durable milestone-set") is satisfied by the already-decided durable/milestone event class — nothing new is required of those nodes.
- **Builds in either truth-world** (already established): under materialized-truth it reads materialized milestone-flags; under log-as-truth, milestone events are compaction-exempt. The decision does not depend on, or vote in, any truth-model question.
- **Stays off the critical path.** No MVP node depends on this one; it remains a pure downstream consumer. The build is unblocked regardless.
- **Open before `ready`:** art/animation pipeline (Rive vs Lottie vs sprites — note `lottie` is already in the tech-stack plugin list) and on-screen placement (gated on [[gamification]] final layout).

## Maturity
decided

## Notes
- Brief §6 (optional motivation), §11 Out (companion is a fast-follow), §15 phase 6.
- Must respect the no-punishment / no-shame constraint and the rejection of tamagotchi-as-core (locked decision #2).
- Sits on top of the motivation layer in [[gamification]]; consumes [[activity-event-stream]].

### Growth model (explored 2026-06-15) — two layers, neither can fall
- **Layer 1 — irreversible milestone stages (the "growth").** Triage shape (b): discrete evolution stages, each unlocked by a specific first-occurrence achievement event (first node mastered, first whole skill-domain completed, first N-day streak *reached* — not maintained). **Stages never regress**; absence removes nothing. This is what makes it positive-only *by construction*. Each stage subscribes to a specific [[activity-event-stream]] event type.
- **Layer 2 — ephemeral per-success reactions (the "aliveness").** On every success event, a transient fire-and-forget flourish (hop, sparkle, momentary ornament) — a *reaction*, not growth. Stateless; never accumulates into anything losable. Fills the "nothing happens between milestones" gap that sinks a pure-cumulative model, without introducing decayable state.
- **Rejected:** (c) streak-coupled — a companion that downgrades on a broken streak is decay in costume, violates the no-shame rule (#2). (a) pure-cumulative — mathematically safe but reads as inert ("came back after a month, looks identical").

### Cold-start constraint (new — not in triage)
- **Stage 0 must be appealing and complete on its own** — never an empty vessel awaiting fill, never paired with "do something to bring it to life." A weak/sad initial state is hidden pressure and hidden shame ("you're nobody yet"). The companion does not grow *out of* emptiness; it is already likable, and milestones *add* rather than *fix*.

### Introduction: present-by-default, minimal, instantly dismissible (NOT opt-in)
- An off-by-default settings toggle is one ~95% of users never find — paying for art nobody sees. So: **default-present from first launch**, but minimal and **never competing with the skill-map** for screen real estate (the map is the motivational core in [[gamification]]).
- The 16+ "this is infantile" concern is answered by **dignity of exit, not consent-gating**: one-tap removal with no sense of having broken anything; re-enable path stays in settings.
- **First greeting is tied to the first success event, not to app launch** — the companion is born into a positively-framed moment rather than meeting a cold beginner on an empty screen.

### Engineering seam (refined)
- Pure consumer; owns **no state of record**. "Derived stage" is precisely a **projection over the durable milestone-set**, NOT over the raw event log — keeps "owns no state of record" true while ensuring derivation reads compaction-immune data, not a log that may be truncated.

### Cross-node invariant contributed to the `activity-event-stream ⚔ local-persistence` conflict
- The companion **deliberately does not cast a vote** in the unresolved truth-model conflict (event-log-as-system-of-record vs materialized-progress-as-truth) — letting a cosmetic feature decide the central truth-model would be a priority inversion. Instead it contributes an **invariant both candidate resolutions must satisfy**:
  > **Milestone-reached facts are durable, compaction-immune state.** A small, bounded, monotonic set of first-occurrence facts MUST survive compaction by definition.
- Resolves pressure #1 (compaction erasing milestone facts): the split is by **frequency + irreversibility**, not compactness-vs-memory — high-volume attempt/answer events stay compaction-eligible; tiny milestone flags are lifted into the snapshot/projection and persist permanently (consistent with #15).
- Resolves pressure #2 (only works if events are truth): companion is **buildable in both worlds** — under materialized-truth it reads materialized milestone-flags (forcing-function weakens but doesn't break); under log-as-truth, milestone events are exempted from compaction (forcing-function stays maximal).
- **Decidable now, independent of the truth-model:** the event schema must **distinguish two event classes from the start** — *compaction-eligible* (high-volume/high-frequency) vs *durable / milestone* (compaction-immune). This is a schema decision; it does not pre-judge the truth-model. Recommend locking it via `/architector:decide` on [[activity-event-stream]]. The truth-model itself stays deferred to [[activity-event-stream]] / [[local-persistence]], with the guarantee the companion survives either outcome.

## Triage
_Seeded: 2026-06-15 via /architector:triage_

### Discussion Points
Questions and topics to work through during `/architector:explore`:

- **Positive-only growth model** — growth tied to success events (node mastered, streak); it **never decays**. Define the growth stages and their triggers. Even neutral "idle/sad" states risk being misread by an anxious user — design only forward states.

- **Pure consumer of [[activity-event-stream]]** — building it on events validates that abstraction; with the schema decided early (decision #16) the companion becomes a later, isolated add with no core rewrite.

- **Asset / animation pipeline** — `Rive` (interactive, state-machine driven) vs `Lottie` (simpler) vs sprite sheets. The real cost is **art production**, which is the actual reason for deferral.

- **Opt-in / dismissible** — some 16+ users read any companion as infantile (the brief's own tamagotchi concern); keep it cosmetic, optional, off the critical path, and never occupying the skill-map's real estate.

### Hidden Concerns
- This is a **content-production effort** more than an engineering one — the deferral is partly a resourcing decision, not just scope.

### Gotchas
- Any inactivity/decay or "come back!" nudge re-introduces exactly the guilt the brief rejected (decision #2).
- Letting the companion compete for screen space with the visible skill-map — the *real* motivational core ([[gamification]]).

### Suggested Reading for /architector:explore
1. What success events drive growth, and what are the growth stages?
2. Is it built purely on [[activity-event-stream]]?
3. Rive vs Lottie vs sprites — and who produces the art?
4. Opt-in default and a placement that doesn't compete with the skill-map?

## Connections
_Mapped 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[activity-event-stream]] — pure consumer of the event stream (validates the abstraction)
- ← [[gamification]] — sits atop the motivation layer

**Contributes to (invariant, not a verdict):**
- ⚔ [[activity-event-stream]] ⚔ [[local-persistence]] — supplies the *milestone facts must be compaction-immune* invariant + the decidable two-class event-schema split; does not vote on the truth-model.

_Deferral is mostly an art-production resourcing call, not engineering. The growth/introduction model and the event-schema invariant are now **locked** (decided 2026-06-23); art pipeline (Lottie vs Rive vs sprites) and exact on-screen placement remain downstream and stay deferred — they keep the node `decided` rather than `ready`._

## History
- 2026-06-15 /architector:new — positive-only cosmetic companion; deferred fast-follow, not a blocker.
- 2026-06-15 /architector:triage — seeded discussion points; confirmed as a pure consumer of the activity-event stream; flagged art production as the real deferral driver.
- 2026-06-15 /architector:explore — settled growth model (two-layer: irreversible milestone stages + ephemeral stateless reactions; rejected cumulative & streak-coupled), cold-start (Stage 0 complete-on-its-own, no empty-vessel), and introduction (present-by-default + dignity-of-exit, not opt-in; first greeting on first success event). Refined seam: derived stage = projection over a durable milestone-set. New cross-node finding: companion contributes a *milestone-facts-must-be-compaction-immune* invariant to the activity-event-stream ⚔ local-persistence conflict and surfaces a two-class event-schema split (compaction-eligible vs durable/milestone) that is decidable now without pre-judging the truth-model. Art pipeline + placement remain deferred.
- 2026-06-23 /architector:decide — locked the exploration model (two-layer growth + cold-start + present-by-default introduction + pure-consumer/durable-milestone-set seam) with rationale and rejected-alternatives; each ruling is a direct consequence of the no-shame north star (#2), so locking now prevents a future inactivity-reaction regression. Art pipeline (Rive/Lottie/sprites) and on-screen placement (gated on gamification's final layout) kept deliberately deferred → advanced explored → **decided (not ready)**. No cascade: the milestone-compaction invariant was already absorbed by the decided activity-event-stream / ready local-persistence; node stays off the critical path.
