# Idea: Spaced Repetition
_Created: 2026-06-15_
_Slug: spaced-repetition_

## Description
Mastered skills periodically **return** to retain automaticity — the mechanism that tutors structurally fail to provide and that the app exists to deliver. The MVP ships "basic" spaced repetition via **banded intervals** computed by a **pure scheduling function** that sits behind a contract; the queue itself is opaque materialized state owned by [[local-persistence]]. Scheduling model and queue storage are now **decided** (see `## Decision`).

## Decision
_Decided: 2026-06-15_

### What Was Decided
Two coupled decisions, both signed off.

**Seam — Option A: pure-function scheduler over a dumb store.**
- [[local-persistence]] owns the queue rows as **opaque materialized state** (queue location was already pinned by the truth-model decision). It never interprets the scheduling fields.
- [[spaced-repetition]] owns a **pure scheduling function**: `(queueItem, reviewOutcome) → updated scheduling fields`. It never touches storage APIs.
- This is the repo's already-locked cross-cutting pattern — *pure deterministic logic behind a contract, persistence as dumb substrate* — the same one the generator contract and `ExplanationProvider` follow, and the one the truth-model reinforced (logic must not live behind raw progress-table access).

**Algorithm — banded in-house intervals (NOT SM-2).**
- Bands e.g. `1d → 3d → 7d → 16d → …`; promote on clean pass, demote on lapse.
- SM-2 models the **wrong thing** — binary flashcard recall — and has nowhere to put Tyama's speed dimension. Banded is not "simplified SM-2"; it is a different model that honestly fits **accuracy + speed** mastery, and matches the "basic" MVP scope.

### Two refinements (so banding doesn't silently discard the speed dimension)
1. **`reviewOutcome` is speed-aware, not boolean.** It carries at minimum `correct?` + speed-relative-to-threshold. "Correct but slow" and "correct and instant" must NOT yield the same next interval. A binary outcome would throw away the speed dimension at the seam — the same SM-2 failure, one level up. This decides *where in the bands* you land: clean+fast promotes up a band, correct-but-slow holds, error demotes. The speed threshold is the same one owned by [[mastery-gates]].
2. **`demote on lapse` is defined precisely, and its boundary with [[diagnostic-loop]] is explicit.**
   - **Magnitude:** one-band demotion, NOT reset-to-band-0. Single-lapse reset is a punitive profile (one slip after a month wipes the schedule) that rubs against the north star.
   - **Boundary:** demotion is a *local scheduler action* (shift the band **within** a node). Routing to a broken prerequisite, or evicting a node from "mastered" back into learning, is **diagnostic-loop's** job — a different decision on a different axis. The scheduler moves the band inside a node; diagnostic-loop decides whether the node is still mastered at all. These must not merge.

### Persisted fields
- `intervalBandIndex` + `dueAt` (+ optional `lapses` for **telemetry only**, never logic).
- Scheduler sits behind the contract, so a future SM-2 swap (if ever) is a single module change with its fields changing alongside it.

### Alternatives Considered
| Option | Why not chosen |
|--------|----------------|
| Seam B — scheduler owns its own persistence | Introduces a second organizing pattern competing with the locked generator/explanation-seam convention. |
| Seam C — logic embedded in persistence | Same second-pattern problem, **and** re-collides with the truth-model (logic must not live behind raw progress-table access). |
| Algorithm — SM-2 | Models binary recall; ease-factor has nowhere to hold the speed dimension. Drop speed → ease-hell for nothing; hack speed in → a non-SM-2 wearing SM-2's name. |

### Rationale
Seam A is the only option that contradicts no locked decision. Banded intervals fit the two-dimensional mastery model honestly rather than bending a recall-only algorithm around it. The two refinements close the trap that would otherwise make "banded" quietly as speed-blind as SM-2 (boolean outcome) or quietly punitive (reset-on-lapse).

### Implications
- [[local-persistence]] — the queue-storage-vs-logic ownership **conflict is now resolved**: persistence stores opaque rows, scheduler owns logic. No change to the locked truth-model.
- [[mastery-gates]] — supplies the **speed threshold** that makes `reviewOutcome` speed-aware; the queue admits only mastered nodes (unchanged).
- [[diagnostic-loop]] — boundary clarified: band-demotion (local) is the scheduler's; un-mastering / prerequisite-routing / queue-eviction is diagnostic-loop's. Neither may do the other's job.

## Priority
core

## Maturity
ready

## Notes
- Brief §1 (the gap tutors don't close), §4.3, part of locked decision #5.
- **Q8 — RESOLVED 2026-06-15 /architector:decide:** banded in-house intervals (not SM-2); pure-function scheduler (Seam A) over an opaque queue stored by [[local-persistence]]. See `## Decision`.
- Interacts with [[mastery-gates]] (only mastered nodes enter the queue; supplies the speed threshold for the speed-aware `reviewOutcome`) and [[diagnostic-loop]] (owns un-mastering / queue-eviction — distinct from the scheduler's local band-demotion).

## Connections
_Mapped 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[mastery-gates]] — only mastered nodes enter the queue
- ← [[diagnostic-loop]] — failed reviews route back / reschedule
- ← [[local-persistence]] — repetition queue stored here

**Conflict (align):**
- ✅ [[local-persistence]] — **RESOLVED 2026-06-15:** Seam A. Persistence stores the queue as opaque materialized state; spaced-repetition owns the pure scheduling function. See `## Decision`.

**Shared concern:**
- [[mastery-gates]] — supplies the speed threshold that makes `reviewOutcome` speed-aware (not boolean)

**Seam (do not merge):**
- [[diagnostic-loop]] — scheduler owns local band-demotion *within* a node; diagnostic-loop owns un-mastering / prerequisite-routing / queue-eviction. Different axes.

## History
- 2026-06-15 /architector:new — periodic return of mastered skills to retain automaticity; the core gap the app closes. Algorithm (in-house vs SM-2) and queue storage are open.
- 2026-06-15 /architector:decide — chose **banded in-house intervals over SM-2** (SM-2 models binary recall, has nowhere for Tyama's accuracy+speed) and **Seam A: pure-function scheduler over an opaque store** (the repo's locked logic-behind-contract / persistence-as-dumb-substrate pattern; only option contradicting no locked decision). Refined: `reviewOutcome` is speed-aware not boolean; `demote on lapse` = one band (not reset), and band-demotion is held separate from diagnostic-loop's un-mastering. Resolved the queue storage-vs-logic conflict with [[local-persistence]]. → `ready`.
