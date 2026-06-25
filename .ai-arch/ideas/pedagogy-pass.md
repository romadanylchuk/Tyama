# Idea: Authored Graph Asset (Pedagogy Pass)
_Created: 2026-06-24_
_Slug: pedagogy-pass_

## Description
The **single deferred artifact** that three architecture nodes have each been waiting on: a **validated, authored bundled graph-as-data asset**. It is not new architecture — it is the *content/calibration* that fills the already-locked graph schema. One pedagogy pass authors it once, and it serializes entirely into the existing graph asset that `loadGraph()` already loads:

- **Atom-catalog content** — which skill atoms exist as nodes, the **prerequisite edges** between them (where the real break hides two nodes back), and the **CPA `representationLevels`** each atom supports. (Owned thread extracted from [[skill-graph]].)
- **Per-node mastery threshold values** — the `masteryThreshold` + per-atom speed values carried in each node's `difficultyHooks`. (Owned thread extracted from [[mastery-gates]].)
- **Per-node difficulty band values** — the ordered `coord → params` bands carried in each node's `difficultyHooks`. (Owned thread extracted from [[difficulty-model]].)

All three land in the **same place**: graph nodes = atoms, `difficultyHooks` = thresholds + bands, `representationLevels` = CPA levels. There is one deliverable, not three. The MVP ships **defaults + a labelled fruit-equations smoke-test fixture**; this node replaces them with the validated authored asset as a **config-as-data swap, no code change** (the `loadGraph()` seam and `difficultyHooks` schema are already locked).

## Priority
deferred

## Maturity
decided

## Decision
_Decided: 2026-06-24_

### What Was Decided
**Extract the shared deferred-pedagogy thread out of the three architecture nodes into this single owned, deferred node — and advance the architecture nodes to `ready` on their locked mechanism + MVP defaults/fixture.**

- The catalog content, mastery threshold values, and difficulty band values were never engineering decisions — they are **pedagogy content/calibration** that fills the locked schema. They are therefore a **separate workstream**, not an unresolved question *inside* each architecture node.
- They are modelled as **one** node (not three) because they converge into **one artifact** — the bundled graph asset — authored by **one owner** (the pedagogy pass), delivered as **config-as-data** behind the existing seam.
- Consequently **[[skill-graph]]**, **[[mastery-gates]]**, and **[[difficulty-model]]** each have their architecture fully specified (mechanism locked + MVP-shippable defaults/fixture) and advance `decided → ready`. This node holds the remaining content debt with a single visible owner, **off the critical path** (no MVP node depends on the *authored* values — only on the *schema* and the shipped defaults).

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| **A — Strict: content/values block `ready`** | Holds the architecture hostage to non-engineering work that may not happen for a while, and **conflates the engine with its data** — the exact data/code, config/state boundary the whole project (#1: "graph is data, never hardcoded") insists on. By that logic [[local-persistence]] couldn't be `ready` until the user's actual data exists. |
| **B — Loosen `ready` in place, no new node** | Flips the three to `ready` but scatters the pedagogy debt across three nodes with **no single owner** and **no node `/finalize` can brief**; the load-bearing "ship fixture, real catalog pending" caveat gets lost, risking a finalize brief that silently treats the smoke-test fixture as the product. |
| **Three separate deferred nodes (one per thread)** | Triples the bookkeeping for what is **one artifact, one owner, one delivery mechanism**; the threads are not independent — they co-serialize into the same graph nodes' `difficultyHooks`. |

### Rationale
The maturity model should track *whether the architectural decision is complete*, not *whether all downstream content exists*. The three threads have always been content/calibration wearing an architecture badge — the brief itself flagged the catalog "to be agreed with pedagogy," and Q6/the band-values were explicitly deferred with **shipped defaults that make the build run**. Extracting them mirrors the architecture's own established moves: splitting `activity-event-stream` out of `social-deferred`, and deferring the `cosmetic-companion` art pipeline as its own resourcing clock. One owned, visible, off-critical-path node is the honest home for the debt, and it lets `/finalize` brief the three engines now while explicitly carrying the "real authored asset is a separate deliverable" flag.

### Implications
- **[[skill-graph]]** → `ready`: finalize briefs the graph **engine** (slug IDs, `graphVersion` migration, `loadGraph()` seam, node schema, prerequisite-only edges) against the labelled smoke-test fixture; the **authored catalog** is this node's deliverable. *Judgment accepted:* a blocking node ships its engine on a fixture, with the real catalog as a tracked downstream artifact.
- **[[mastery-gates]]** → `ready`: shipped default thresholds **are** the MVP spec; pedagogy tuning is post-MVP refinement here.
- **[[difficulty-model]]** → `ready`: shipped default bands **are** the MVP spec; calibration is refinement here.
- **Delivery is a config-as-data swap** — no consumer rewrite when the authored asset replaces the fixture/defaults (the seam discipline pays off exactly here).
- **Off the critical path:** no MVP node depends on this node's *output*; they depend on the graph *schema* (locked) and the *shipped defaults* (present).
- **Not in scope of this ruling:** `activity-event-stream` and `cosmetic-companion` are `decided`-not-`ready` for unrelated reasons (truth-model substrate / art-pipeline + placement resourcing) and are untouched.

## Connections
_Created 2026-06-24 via /architector:decide._

**Provides authored content to (→, deferred; MVP ships defaults/fixture):**
- → [[skill-graph]] — authored atom catalog: atoms-as-nodes + prerequisite edges + per-atom CPA `representationLevels`. Replaces the labelled smoke-test fixture via the `loadGraph()` seam.
- → [[mastery-gates]] — per-node `masteryThreshold` + per-atom speed values in `difficultyHooks`. Replaces shipped defaults.
- → [[difficulty-model]] — per-node ordered difficulty bands in `difficultyHooks`. Replaces shipped defaults.

**Shared concern:**
- ↔ [[local-persistence]] — a re-authored asset bumps `graphVersion`, triggering the #15 split/merge/deprecate mastery-migration chain owned by local-persistence. (No new requirement — the migration mechanism already anticipates content changes.)

_Off the critical path: a pure content/calibration consumer of the locked graph schema, not a dependency of any MVP feature node._

## History
- 2026-06-24 /architector:decide — created to absorb the shared deferred-pedagogy thread. Resolved the structural "pedagogy-gate" question: chose to **extract** the catalog-content + threshold-values + band-values threads into one deferred owned node (option C) over keeping the three architecture nodes hostage at `decided` (A — conflates engine with data) and over loosening `ready` in place with scattered notes (B — no single owner, finalize can't brief it). All three threads co-serialize into the one bundled graph asset, so one node/one owner/one config-as-data delivery is the correct grain. Unblocked [[skill-graph]], [[mastery-gates]], [[difficulty-model]] to `ready`. Stays `decided` not `ready` (the authored asset is the open content work) and `deferred` priority (off the critical path).
