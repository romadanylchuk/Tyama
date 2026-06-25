# Idea: Gamification & Progress Visualization
_Created: 2026-06-15_
_Slug: gamification_

## Description
The gamification **core is the skill graph itself**, made visible to the user with per-node **graded "mastery rings"** — it is simultaneously motivation and a map. The ring has **no independent fill semantics**: it renders the single `masteryLevel` scalar (from [[mastery-gates]]) under its own cut-point — no second progress source. Because that scalar runs **along the CPA trajectory**, concrete success already produces visible nonzero fill, so a novice sees motion immediately (north-star relevant). On top sits a **light, age-neutral, no-pressure motivation layer**: streaks, XP, node mastery. Optionally a cosmetic companion that grows from success (handled as a separate deferred node).

"Where to next" is **owned here**, never read off prerequisite edges: it is a prioritized merge of diagnostic debt → capped due-reviews → a **curated entry path** (new data this node introduces). The whole node is governed by a single anti-shame invariant — **no UI state ever shows the user something subtracted, only gained or not-yet-gained.**

## Priority
core

## Maturity
ready

## Decision
_Decided: 2026-06-17_

### What Was Decided
Four sub-decisions, all locked.

**1. Ring fill — GRADED, single shared scalar (not binary).** A ring has no independent fill semantics; it renders the `masteryLevel` scalar from [[mastery-gates]] under its own cut-point. Binary would re-introduce a separate progress source (the three-sources-of-truth disease already cured). States: `not-yet-open`, `available`, `in-progress` (partial fill = current `masteryLevel`), `mastered` (full). Because the scalar runs along the CPA trajectory, the ring shows movement along the trajectory — concrete success yields visible nonzero fill before abstract mastery.

**2. Locked-state — NO punitive iconography.** Unavailable nodes render as `not-yet-open` (muted, present, no padlock), never as `locked`. A padlock tells an anxious 16+ "you haven't earned this" — a soft form of the rejected shame. The map shows the road ahead, not gates undeserved.

**3. Anti-shame — ONE invariant, not a list of bans.** Single principle: **no UI state ever shows the user something *subtracted* — only gained or not-yet-gained.** Everything derives automatically: streak-miss → no red/loss state; XP never deducted; a ring never empties; an unavailable node is "not yet open," never "lost/closed." Lifted to a cross-cutting product principle (same move as the companion's positive-only-by-construction), referenced rather than re-enumerated per case.

**4. "Where to next" — prioritized merge of three sources, NEVER prerequisite edges.**
`next = diagnostic-debt ?? due-reviews(capped) ?? curated-next-on-path`
  1. **Diagnostic signal (highest, unconditional).** If [[diagnostic-loop]] flagged a broken prerequisite, that is next — it is the heart of the product (route to the cause). Beats everything.
  2. **Due reviews ([[spaced-repetition]]), capped.** No active diagnostic debt but matured reviews exist → review next. Capped so it can't dominate forward movement — the app must not stall in endless repetition of mastered material.
  3. **Curated entry path.** No debt, no urgent reviews → where to grow next. **Curated, not graph-derived:** the prerequisite graph says what is *possible* (which nodes are unlocked); it does not say what is *worthwhile next* among several unlocked nodes — that is a product/pedagogy claim. The curated path is a separate ordered progression sequence that *respects* the graph (never proposes a not-yet-open node) but is not derived from it.

**Motivation primitives.** Node-mastery (rings/map) = primary signal. **Streak:** a "kept" day = any session meeting a low achievable bar (≥1 completed task, not a quota); a miss is silent — pauses/resets upward, never displays a penalty. **XP:** awarded on task completion + mastery milestones, never lost; secondary to node-mastery. **Comparison/leaderboards:** off by default (CLAUDE.md §6 / brief).

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Binary ring fill (mastered / not) | Re-introduces a second progress source independent of `masteryLevel` — the three-sources-of-truth problem already cured by the single scalar. Also hides early CPA motion (empty ring until abstract mastery). |
| `locked` state with padlock for unavailable nodes | Reads as "you haven't earned this yet" to an anxious 16+ — a soft shame mechanic, violates the north star. |
| Enumerated per-case anti-shame bans | Fragile, easy to miss a case; replaced by one invariant from which every case derives. |
| "Next" derived from prerequisite edges | Re-merges the deliberately separated *objective structure* (graph) vs *product route* split. Graph = possible; it cannot encode worthwhile. |
| Curated path stored in the skill graph | Conflates "possible" (graph's job) with "worthwhile" (product/pedagogy's job); the path is new data owned here. |
| Streak with loss/red state on miss; deductible XP | Direct violation of the anti-shame invariant — subtracted state. |

### Rationale
Every choice is subordinate to the north star (dissolve fear/avoidance). The graded ring + CPA-trajectory scalar makes progress *felt immediately*; the anti-shame invariant guarantees the UI never punishes; the three-source "next" makes the product's diagnostic thesis (route to the cause) the top priority while preventing review-stall and keeping forward growth a pedagogy claim rather than a graph artifact. The single-scalar ring preserves the one-source-of-truth discipline established in [[mastery-gates]].

### Implications
- **New data introduced here:** the **curated entry path** — an ordered progression sequence, separate from the skill graph. Mechanism is decided now with a **shipped default**; the specific sequence is owned by the **deferred pedagogy pass** (mirrors [[skill-graph]]'s atom catalog and [[mastery-gates]]' thresholds). This is the decided-not-blocking pattern, not an open question.
- **Cross-cutting principle:** the anti-shame invariant ("only gained or not-yet-gained, never subtracted") is lifted to a product-wide principle, shared with [[cosmetic-companion]]'s positive-only-by-construction.
- Consumes the `masteryLevel` scalar ([[mastery-gates]]), the diagnostic signal ([[diagnostic-loop]]), and the capped due-queue ([[spaced-repetition]]); persists streak/XP/curated-path-position via [[local-persistence]]; emits streak/milestone events into [[activity-event-stream]].

## Notes
- Brief §6, locked decisions #1 (graph + light motivation core) and #2 (no tamagotchi guilt mechanic).
- **Deliberately rejected:** tamagotchi-as-core and any guilt mechanics ("character dies if you don't check in") — they work against the primary goal for an anxious user and are infantile for 16+.
- Visualizes mastery state from [[mastery-gates]]; streak/XP persisted via [[local-persistence]].
- **Curated entry path = decided-not-blocking:** mechanism + shipped default locked; calibrated sequence deferred to the pedagogy pass. No open questions remain → node is `ready`.

## Connections
_Mapped 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[skill-graph]] — the graph IS the visible mastery-ring surface
  - _Dependency satisfied (skill-graph A1/A5, /decide 2026-06-15): render rings over node IDs. **CAVEAT now MATERIALIZED (/decide 2026-06-17):** "where to next" is gamification's own decision, never derived from prerequisite edges. The graph only **filters** the curated entry path for availability ("possible"); "worthwhile" belongs here. See ## Decision #4._
- ← [[mastery-gates]] — mastery state drives the rings
- ← [[local-persistence]] — streak/XP persisted here

**Blocks (→):**
- → [[cosmetic-companion]] — companion sits atop this motivation layer

**Shared concerns:**
- [[skill-graph]] — same DAG surface: data vs presentation; kept separate deliberately (no merge)
- [[activity-event-stream]] — streak/milestone events produced here

## History
- 2026-06-15 /architector:new — skill graph as the visible gamification core (mastery rings) + light motivation layer (streak, XP, mastery). Guilt/tamagotchi mechanics explicitly rejected.
- 2026-06-17 /architector:decide — locked all four sub-decisions → `ready`. Rings = GRADED single `masteryLevel` scalar (not binary); unavailable nodes = `not-yet-open` (no padlock/shame); anti-shame = ONE invariant ("only gained or not-yet-gained, never subtracted"), lifted to a cross-cutting principle; "where to next" = prioritized merge `diagnostic-debt ?? capped-due-reviews ?? curated-entry-path`, never prerequisite edges. Curated entry path = new data owned here (shipped default now, sequence deferred to pedagogy pass).
