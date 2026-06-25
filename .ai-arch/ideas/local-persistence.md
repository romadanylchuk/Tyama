# Idea: Local Persistence
_Created: 2026-06-15_
_Slug: local-persistence_

## Description
Offline-first **on-device storage** of user progress and skill-graph state. No backend in the MVP, so this is the system of record. The specific DB/format is the architect's choice (SQLite / MMKV / files), and graph-schema versioning — including node **split / merge / deprecate** migration — must be handled as the graph evolves.

**Truth-model (decided 2026-06-15):** **hybrid transactional dual-write.** Materialized progress state is the authoritative **read/decision** model; the **durable/milestone event class** is authoritative **immutable history**; the two are written in a **single atomic transaction** so they cannot diverge. The high-volume event class is a compaction-eligible firehose. (Pure event-sourcing and pure side-log both rejected — see `## Decision`.)

## Decision
_Decided: 2026-06-15_

### What Was Decided
**Option C — hybrid transactional dual-write**, resolving the `activity-event-stream ⚔ local-persistence` truth-model conflict:

- **Materialized progress state is the authoritative read/decision model** — per-node mastery, streak/XP, the spaced-repetition queue. This is what the core loop reads every interaction (diagnostic-loop, mastery-gates, spaced-repetition, gamification) — fast current-state reads, no replay.
- **The durable / milestone event class is authoritative immutable history** — compaction-immune, the bounded monotonic set of first-occurrence facts.
- **The high-volume event class is a compaction-eligible firehose** — attempts, per-answer events; truncatable by design (snapshot/compaction, decision #15 secondary clause).
- **Social and the cosmetic companion remain pure consumers of the durable event class** — no core rewrite when social ships.
- **Sync-readiness** (logical clocks + device id) rides on the events.

### Non-negotiable enforcement (keeps C from decaying into B)
The integrity of C rests on one rule, and **developer discipline is too fragile to hold it** — a drift bug would be silent and surface in the *consumer*, not the source (tests stay green because materialized state is still correct).

- **Rule:** every milestone-state mutation **and** the emission of its durable event occur in **one atomic transaction**.
- **Enforce structurally, not by convention:** milestone mutations MUST NOT be reachable via raw progress-table access. Route them through a **single narrow gate** (one repository method / transactional wrapper) that physically performs both writes together and makes it **impossible to persist milestone state without its event**. This converts the invariant from "remember to" into "cannot do otherwise."

### Scope carve-out (avoid a performance footgun)
- Atomicity binds the pair **materialized-milestone-state ↔ durable-event only**.
- The **high-volume class is NOT required to share that transaction** with progress — it may be written separately, with relaxed guarantees, because its loss under compaction is by design. **Do not wrap the firehose in the strict milestone transaction.**

### Alternatives Considered
| Option | Why not chosen |
|--------|----------------|
| A — Pure event-sourced (log = sole truth, progress = projection) | Its core benefit (multi-writer reconciliation) is **disabled** in an offline, single-device, no-backend MVP, yet it still charges the full price: slow launch-time fold + incompatibility with compaction (can't truncate the firehose *and* rebuild from it). Paying for an unused service. |
| B — Pure materialized + non-authoritative side-log | The log silently **drifts** from truth, breaking the companion/social consumer contract and making milestone durability ad-hoc. The enforcement gate above is precisely what stops C from degrading into B. |

### Rationale
C buys exactly the two things actually needed — fast materialized reads for the core loop + ironclad compaction-immune milestone history — and skips the one that isn't (a replayable multi-writer log). Its only stated downside (a dual write + one discipline rule) is reduced to "one well-encapsulated gate" by enforcing the atomic pairing structurally. It honors every prior decision: companion invariant (milestone durability), bounded growth (firehose compaction), the two-class event schema, no-backend MVP, and social-as-consumer.

### Implications
- **Unblocks the bottleneck:** local-persistence reaches `decided`, which gates the blocking nodes [[skill-graph]] and [[task-generation]] (node-identity #15) — though the **storage-engine choice (SQLite/MMKV/hybrid) remains open**, so this node is `decided`, not `ready`.
- [[activity-event-stream]] — the paired two-class event schema is locked jointly (also now `decided`); the conflict edge is resolved.
- [[cosmetic-companion]] — its milestone-durability invariant is now guaranteed by the durable event class + the enforcement gate.
- [[spaced-repetition]] — the *separate* queue storage-vs-logic ownership conflict is **not** resolved by this and remains open.

---

## Decision — Storage Engine
_Decided: 2026-06-22_

### What Was Decided
**expo-sqlite only.** A single transactional store backs the entire system of record. This was not a SQLite-vs-MMKV choice — the locked truth-model (Option C) already forced SQLite; the only live question was *which* SQLite, and at MVP scale the answer is the Expo-blessed module.

**Load-bearing seam clause (without it the "MMKV later" promise is empty):** all hot-state reads (persona enum, UI/content/explanation languages, current node, settings) go through the **same repository interface** as everything else — e.g. `settings.get(key)` — from day one. MVP implementation = a small SQLite settings table; a future MMKV swap is then one implementation behind the interface with **zero consumer changes**. The seam discipline used everywhere (`loadGraph`, `ExplanationProvider`, the scheduler) is **explicitly extended to hot-settings** — otherwise the hot path, exactly where MMKV would later be wanted, becomes the one place not behind a seam, and the swap means rewriting every scattered raw-SQL read site.

### Alternatives Considered
| Option | Why not chosen |
|--------|----------------|
| expo-sqlite + MMKV hybrid | MMKV is a synchronous KV store with **no transactions** — it physically cannot provide the atomic milestone-state↔durable-event gate that keeps Option C from decaying into the rejected Option B. So MMKV could only ever back hot-settings, never log/queue/progress — buying a second engine and a second version axis for a non-critical read a SQLite table already serves. Marginal gain, disqualifying limitation. |
| op-sqlite | Faster JSI SQLite with the same transactional guarantees — but perf is not an MVP constraint, and it trades the Expo-blessed module for a community one (added native-surface risk) for speed nobody needs yet. Premature. |
| WatermelonDB | An ORM + **sync engine** built for the multi-writer model Option C **explicitly rejected**. Paying full price for a disabled benefit on an offline single-device MVP — the same error already caught with CAS and event-sourcing. Overkill. |

### Rationale
expo-sqlite wins on four axes at once: it satisfies the **atomic gate** (transactions built in), matches the **queryable access pattern** (event log, `dueAt`-ordered repetition queue, per-node mastery history — relational work, not hot KV), adds **no native surface** beyond the already-committed prebuild, and keeps **one version axis** not two. The other three each fail on construction, not taste.

### Implications
- **Node advances `decided` → `ready`** — no open questions remain (engine chosen; node-identity/#15 resolved; event-log shape resolved by the truth-model; spaced-repetition queue storage settled via Seam A; sync-readiness fields laid in).
- **New build obligation:** a hot-state **repository seam** (`settings.get/set`-style) must exist from the first commit, SQLite-backed, with no raw-SQL hot reads in UI/consumer code.
- **Closes [[tech-stack]]'s last open thread** — the native-module cost trigger ($99/EAS, ends Expo Go) is bound to the **prebuild decision already made**; expo-sqlite activates nothing new beyond what was already agreed. With its other thread (catalog tooling) resolved by [[i18n-strings]] on 2026-06-22, tech-stack now has no open threads and is eligible to advance to `ready`.

## Priority
blocking

## Maturity
ready

## Notes
- Brief §11/§12, open question #1 — DB/format engine not yet chosen (SQLite vs MMKV vs hybrid).
- **Promoted core → blocking** per triage: the node-identity + versioning decision constrains [[skill-graph]] and [[task-generation]] (both blocking).
- Must store: per-node progress/mastery, streak/XP, the spaced-repetition queue ([[spaced-repetition]]), the user identity ([[social-deferred]]), the [[activity-event-stream]], and possibly the graph config itself.
- Two distinct version axes — **DB schema** (if SQLite) vs **graph content** — must not be conflated.

## Triage
_Seeded: 2026-06-15 via /architector:triage_

### Discussion Points
Questions and topics to work through during `/architector:explore`:

- **Storage engine — SQLite vs MMKV vs hybrid** — the access pattern is queryable (event log, repetition queue, per-node mastery history), which favors SQLite (`expo-sqlite` / `op-sqlite` / WatermelonDB). MMKV (synchronous KV) fits hot small state (current language, settings, current node). A hybrid (MMKV hot path + SQLite for log/queue) is common.
  _Context: AsyncStorage is the RN default but slow and size-limited — do not use it for the event log._

- **Config vs mutable-state boundary** — the skill-graph *definition* is shipped config (bundled asset); per-user *progress* is mutable and references node IDs. Drawing this boundary cleanly is what makes versioning tractable.
  _Context: if state stores graph structure inline, every release that edits the graph forces a data migration._

- **Backup / export — RESOLVED (R3 / decision #14)** — user-initiated **JSON export/import** via share-sheet / Files / iCloud Drive document. No sync service, no backend. Protects streaks (north-star) without violating "no backend in MVP." State this explicitly so no one builds a sync server.

- **Node identity + migration — RESOLVED (R4 / decision #15)** — stable IDs (never indices or display names) ship **together with** an explicit **split/merge/deprecate mastery-migration mapping**. Preservation-by-ID covers only the *add* case; the migration mapping covers splits/merges/deprecations.

- **Event-log shape — decide with [[activity-event-stream]]** — system-of-record (event-sourced, progress = projection) vs side-log next to materialized state; this drives the **snapshot/compaction** design (decision #15 secondary) to bound on-device growth.

- **Sync-readiness lay-in** — monotonic/logical timestamps + device id are cheap to add now and painful to retrofit if `ApiExplanationProvider` / social arrive.

### Hidden Concerns
- **Two version axes** (DB schema vs graph content) are frequently conflated — they migrate independently and need separate version stamps.
- The **repetition queue** is stored here but its scheduling is owned by [[spaced-repetition]] — settle storage-vs-logic ownership.

### Gotchas
- Keying progress by node **array index or display name** → graph edits corrupt existing users (decision #15 exists precisely to prevent this).
- Reaching for **AsyncStorage**, then hitting perf/size limits once the event log grows.
- **Lazy migrations without a version stamp** → silent corruption.

### Suggested Reading for /architector:explore
1. SQLite vs MMKV vs hybrid, given the queryable event-log + queue access pattern?
2. Where exactly is the config/state boundary, and how are node IDs minted (slug vs UUID)?
3. Is the event log the system of record or a side log — and what triggers compaction?
4. What is the concrete format of the split/merge/deprecate migration mapping?
5. Which sync-readiness fields to lay in now (timestamps, device id, logical clock)?

## Connections
_Mapped 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[activity-event-stream]] — event schema (decide-early) decides the storage shape

**Blocks (→):**
- → [[skill-graph]] — node identity + migration (#15) constrains graph evolution
- → [[task-generation]] — stable node IDs to register against
- → [[mastery-gates]] — mastery state persisted here
- → [[spaced-repetition]] — repetition queue stored here
- → [[gamification]] — streak/XP persisted here
- → [[social-deferred]] — user identity model persisted here

**Shared concern:**
- [[activity-event-stream]] — event-log shape (system-of-record vs side-log) is jointly owned

**Split signal:**
- storage-engine choice (SQLite/MMKV) vs node-identity/migration mapping (#15) can be decided on separate clocks

**Conflicts:**
- ✅ [[activity-event-stream]] — **RESOLVED 2026-06-15:** hybrid transactional dual-write (materialized = read-authority, durable event class = immutable history, atomic pairing via a single gate). See `## Decision`.
- [[spaced-repetition]] — repetition-queue storage-vs-logic ownership still unsettled (flag, not a blocker — untouched by the truth-model decision)

_Stealth bottleneck: blocks 2 blocking nodes via node identity. Prioritise deciding the identity/migration half even if the engine stays open._

## History
- 2026-06-15 /architector:new — offline-first on-device persistence is the MVP system of record; DB choice and graph-schema versioning open.
- 2026-06-15 /architector:triage — promoted core → blocking; seeded discussion points; backup (R3/#14) and node-identity+migration (R4/#15) resolved; engine choice and event-log shape remain open.
- 2026-06-15 /architector:decide — resolved the truth-model conflict with [[activity-event-stream]]: chose **hybrid transactional dual-write** (Option C) over pure event-sourcing (reconciliation benefit disabled offline, fights compaction) and pure side-log (silent drift). Materialized state = read-authority; durable event class = immutable history; atomic pairing enforced structurally via a single narrow gate; firewall the high-volume firehose out of that transaction. → `decided` (not `ready`: storage-engine choice still open).
- 2026-06-22 /architector:decide — chose **expo-sqlite only** over MMKV/hybrid (no transactions → can't hold the atomic gate), op-sqlite (premature perf, community-module risk), and WatermelonDB (sync engine for a rejected multi-writer model). Truth-model already forced SQLite; this picked the Expo-blessed module on a one-engine/one-version-axis basis. Added the load-bearing clause: hot-state reads go through the same repository seam from day one so MMKV stays a zero-consumer-change swap. Last open question closed → `ready`; also closes [[tech-stack]]'s last open thread (native-module cost is the already-made prebuild call).
