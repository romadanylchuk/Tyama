# Idea: Activity-Event Stream (core substrate)
_Created: 2026-06-15_
_Slug: activity-event-stream_

## Description
An append-only log of activity events (node mastered, streak advanced, milestone reached, session completed). Reclassified out of "Social (deferred)" because it is **load-bearing core substrate**, not future social plumbing: it constrains the storage shape in local persistence and is the feed the cosmetic companion consumes. The **event schema is decided early**; only the social *UI* that would also consume these events stays out of the MVP.

**Schema & truth-model (decided 2026-06-15):** the schema is split into **two event classes** — **durable / milestone** (compaction-immune, authoritative immutable history) and **high-volume** (compaction-eligible firehose). The log is **not** the sole system of record; under the hybrid truth-model owned by [[local-persistence]], materialized progress is the read-authority and the durable event class is paired to milestone state in a single atomic transaction. See `## Decision`.

## Decision
_Decided: 2026-06-15_

### What Was Decided
**Two-class event schema, under a hybrid (not event-sourced) truth-model.** Decided jointly with [[local-persistence]] (which owns the system-of-record half — see its `## Decision`).

- **Durable / milestone class** — irreversible first-occurrence facts (first node mastered, first domain completed, first N-day streak *reached*). Small, bounded, monotonic. **Authoritative, immutable, compaction-immune.** Lifted into the snapshot/projection that survives compaction (#15) by definition.
- **High-volume class** — attempts, per-answer events, session telemetry. **Compaction-eligible firehose**; truncatable by design.
- The event log is therefore a **side-channel for the read model but the system of record for milestone history** — milestone events are written **atomically with** the materialized milestone-state they correspond to, through the single narrow gate defined in [[local-persistence]]. The firehose is written separately, with relaxed guarantees.
- **Consumers** (cosmetic companion now; social UI later) subscribe to the **durable class** — guaranteeing the "new social layer = a new consumer, not a core rewrite" promise.
- **Sync-readiness** fields (monotonic/logical timestamps + device id) are laid in on every event now, though no sync ships in the MVP.

### Alternatives Considered
| Option | Why not chosen |
|--------|----------------|
| Single undifferentiated event log | Forces a choice between unbounded growth (keep everything) and losing milestone facts to compaction (truncate everything). The two-class split is what makes "compact the firehose, keep the milestones" expressible. |
| Log as sole system of record (event-sourced) | Rejected at [[local-persistence]]: reconciliation benefit is disabled offline/single-device, and it fights compaction + slow mobile fold. |

### Rationale
The split is by **frequency + irreversibility**, not by compactness — exactly the distinction surfaced by [[cosmetic-companion]]'s explore. It lets the system bound on-device growth without ever risking a milestone fact, and it lets the companion/social consumers read a durable, compaction-immune feed regardless of how the firehose is truncated. It was the cheapest forward move in the graph: decidable now, independent of (and unblocking) the truth-model itself.

### Implications
- [[local-persistence]] — storage shape is now fixed: two physically distinguished event classes; durable class paired atomically with milestone state; firehose separate. Unblocks that node to `decided`.
- [[cosmetic-companion]] — its milestone-durability invariant is satisfied by construction; the companion is buildable as a pure consumer of the durable class.
- [[social-deferred]] — future social UI plugs in as a new consumer of the durable class, no core rewrite.
- [[mastery-gates]] / [[gamification]] — remain the *producers* of node-mastered / streak / milestone events; this decision fixes the *class* each event lands in.

## Priority
core

## Maturity
ready

## Notes
- Reclassified per triage resolution **R5 / locked decision #16**. Previously bundled inside [[social-deferred]] as "lay in identity + event stream."
- **Decide-early:** the event schema constrains [[local-persistence]] (storage shape) and [[cosmetic-companion]] (consumer); fix it before either is built.
- Open design question: is the event log the **system of record** (event-sourced, progress is a projection) or a **side log** next to materialized progress state? Settle with [[local-persistence]].
- **Unbounded growth:** if the log is both system of record and companion feed, it reaches hundreds of thousands of SQLite rows within a year — design **snapshot/compaction** now (locked decision #15, secondary clause).
- Sync-readiness is cheap to lay in now (monotonic/logical timestamps, device id) even though no sync ships in the MVP — coordinate with [[local-persistence]].
- **Two-class event schema (surfaced by [[cosmetic-companion]] explore, 2026-06-15 — decidable now, independent of the truth-model):** the schema should distinguish **compaction-eligible** events (high-volume/high-frequency: attempts, per-answer) from **durable / milestone** events (irreversible first-occurrence facts: first node mastered, first domain completed, first N-day streak reached). The companion contributes the invariant that **milestone-reached facts must be durable and compaction-immune** — a bounded, monotonic, tiny set lifted into the snapshot/projection that survives compaction (#15) by definition. This invariant binds **both** sides of the truth-model conflict below and does **not** vote on it: under materialized-truth the companion reads materialized milestone-flags; under log-as-truth, milestone events are exempted from compaction. Candidate to lock the two-class split here via `/architector:decide` ahead of resolving the truth-model.

## Connections
_Mapped 2026-06-15 via /architector:map._

**Blocks (→):**
- → [[local-persistence]] — event schema (decide-early) decides the storage shape
- → [[cosmetic-companion]] — pure consumer of the stream
- → [[social-deferred]] — future social UI is a new consumer of events

**Shared concerns:**
- [[local-persistence]] — event-log shape (system-of-record vs side-log) is jointly owned
- [[mastery-gates]] / [[gamification]] — node-mastered / streak / milestone events produced there

**Conflict:**
- ✅ [[local-persistence]] — **RESOLVED 2026-06-15:** hybrid transactional dual-write (not event-sourced). Materialized progress = read-authority; durable event class = immutable history, paired atomically with milestone state via a single gate; firehose compaction-eligible and written separately. The companion's milestone-immutability invariant is now guaranteed by the durable class. See `## Decision`.

## History
- 2026-06-15 /architector:new — created implicitly inside social-deferred as "lay in identity + event stream."
- 2026-06-15 /architector:triage — extracted into its own node and reclassified as core substrate (R5 / decision #16); event schema marked decide-early; snapshot/compaction flagged.
- 2026-06-15 /architector:explore (via [[cosmetic-companion]]) — gained the two-class event-schema split (compaction-eligible vs durable/milestone) + the milestone-facts-must-be-compaction-immune invariant; this is decidable now and constrains both sides of the truth-model conflict without resolving it.
- 2026-06-15 /architector:decide — locked the **two-class event schema** and resolved the truth-model conflict with [[local-persistence]] as **hybrid transactional dual-write** (not event-sourced): durable/milestone class = authoritative immutable history paired atomically to milestone state; high-volume class = compaction-eligible firehose written separately; consumers (companion, future social) subscribe to the durable class. → `decided`.
- 2026-06-24 /architector:finalize — advanced **decided → ready** (bookkeeping). No open questions remained in the node: the two-class schema and the hybrid truth-model are fully locked, and [[local-persistence]] (which owns the system-of-record half) reached `ready`. Confirmed by user at finalize gate.
