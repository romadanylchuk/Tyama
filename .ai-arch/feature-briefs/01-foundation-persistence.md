# Feature Brief: Foundation & Persistence Substrate
_Stage: 01_
_Created: 2026-06-24 via /architector:finalize_
_Arch nodes covered: tech-stack, local-persistence, activity-event-stream_

## Goal
Stand up the runtime skeleton and the offline-first system of record that every other stage writes through. This stage delivers a React Native / Expo (managed + prebuild) app shell that builds for iOS and Android, plus a single transactional SQLite store implementing the hybrid truth-model: materialized progress state as the read/decision authority, a durable/milestone event class as immutable history written atomically with milestone state, and a compaction-eligible high-volume firehose. No feature logic yet — this is the substrate, its seams, and its versioning/migration spine.

## Context
- **Stack is locked:** Expo **managed workflow + prebuild** (config plugins / dev-client), **no bare workflow**. The full MVP native surface is plugin-reachable, so going bare is pre-insurance against a trigger that doesn't exist. (tech-stack D1.)
- **Honest cost, already owned:** the first native module (here, `expo-sqlite`) ends Expo Go → a **development build + $99/EAS** is required. This cost is *triggered by* persistence and was accepted as a consequence of the already-made prebuild call. Plan for dev-build testing on real iOS + Android from this stage on.
- **Storage engine is decided: `expo-sqlite` only.** Not a SQLite-vs-MMKV choice — the truth-model (Option C) already forced SQLite (MMKV has no transactions, so it cannot hold the atomic gate); the only live question was *which* SQLite, and at MVP scale the answer is the Expo-blessed module. (local-persistence, 2026-06-22.)
- **Truth-model is decided: hybrid transactional dual-write (Option C)** — not event-sourced, not a non-authoritative side-log. Co-decided with activity-event-stream.
- **Two version axes must not be conflated:** DB-schema version (table shape) vs graph-content `graphVersion` (owned by skill-graph, stage 02). They migrate independently and need separate stamps.

## What Needs to Be Built
After this stage exists:
1. **Expo app scaffold** — managed + prebuild config, dev-client build pipeline, builds and runs on iOS + Android. Offline-first throughout (no network calls anywhere).
2. **`expo-sqlite` system of record** with:
   - **Materialized progress tables** — the authoritative read/decision model (per-node mastery, streak/XP, the spaced-repetition queue rows). Fast current-state reads, no replay.
   - **Two-class event log** — a **durable/milestone** class (compaction-immune, bounded, monotonic: first node mastered, first domain completed, first N-day streak reached) and a **high-volume firehose** class (attempts, per-answer events; compaction-eligible/truncatable).
   - **Sync-readiness fields on every event** — logical/monotonic timestamps + device id (no sync ships, but they're cheap now and painful to retrofit).
3. **The single narrow milestone gate (non-negotiable, enforced structurally).** Every milestone-state mutation **and** the emission of its durable event happen in **one atomic transaction**, routed through one repository method / transactional wrapper. Milestone mutations MUST NOT be reachable via raw progress-table access — make it *impossible* to persist milestone state without its event. This is what keeps Option C from silently decaying into the rejected side-log (Option B); a drift bug would be silent and surface in a *consumer*, not the source.
   - **Scope carve-out:** atomicity binds **materialized-milestone-state ↔ durable-event only**. The firehose is written **separately**, with relaxed guarantees — do **not** wrap it in the strict milestone transaction (performance footgun).
4. **Hot-state repository seam (`settings.get/set`-style), from the first commit.** All hot-state reads (persona enum, UI/content/explanation languages, current node, settings) route through one repository interface, MVP-backed by a small SQLite settings table. No raw-SQL hot reads in UI/consumer code. This keeps a future MMKV swap one implementation behind the interface with zero consumer changes.
5. **Node-identity + migration spine (#15).** Progress is keyed on **stable node IDs only** (never array index or display name). Ship the split/merge/deprecate **mastery-migration mapping** mechanism — preservation-by-ID covers only the *add* case. DB-schema version stamp present; lazy migrations must carry a version stamp (silent corruption otherwise).
6. **JSON export/import backup (#14)** — user-initiated, via share-sheet / Files. No sync service, no backend.
7. **Activity-event-stream as a substrate consumers subscribe to** — the durable class is the feed; producers (mastery/gamification, stages 04/06) and consumers (companion/social, deferred) bind to it later.

## Dependencies
- **Requires:** — (foundation; nothing precedes it)
- **Enables:** 02 (stable node IDs to register generators against; the #15 migration spine that constrains graph evolution), and indirectly every stage that persists (04 mastery, 05 queue, 06 streak/XP/persona).

## Key Decisions Already Made
- **Expo managed + prebuild, no bare** — recognizing the absence of a bare trigger, not a bet (tech-stack D1).
- **`expo-sqlite` only** — the truth-model forced SQLite; expo-sqlite wins on four axes at once (atomic gate built in, queryable access pattern, no native surface beyond prebuild, one version axis). MMKV (no transactions), op-sqlite (premature perf / community-module risk), WatermelonDB (sync engine for a rejected multi-writer model) each rejected by construction.
- **Hybrid transactional dual-write** — materialized = read-authority; durable event class = immutable history; atomic pairing via a single structural gate; firehose firewalled out of that transaction. Pure event-sourcing rejected (reconciliation benefit disabled offline/single-device, fights compaction, slow mobile fold); pure side-log rejected (silent drift breaks the consumer contract).
- **Two-class event schema** — split by frequency + irreversibility, not compactness. Lets the system bound on-device growth without ever risking a milestone fact.
- **Hot-state behind the same repository seam from day one** — load-bearing clause; without it the "MMKV later" option is an empty promise.

## Open Technical Questions
Deliberately left for /interview or /deep-plan (require codebase/implementation context this stage establishes):
- Concrete SQLite schema: exact tables, indices, and the `dueAt`-ordered query shape for the repetition queue (the queue rows are stored here; scheduling logic is stage 05).
- Exact form of the split/merge/deprecate migration mapping (a config table? a migration-function registry?) and how a `graphVersion` bump (stage 02) triggers it forward.
- DB-schema migration runner mechanics (versioned migrations, transactional application).
- Repository-seam API surface: the precise method set for `settings.get/set` and for the milestone gate wrapper.
- Compaction/snapshot trigger policy for the firehose (when, how much).

## Out of Scope for This Stage
- Any skill-graph content or `loadGraph()` implementation (stage 02 — though the graph *asset versioning* axis is coordinated here via #15).
- Generators, checking, mastery, scheduling logic (their **stored shapes** live here; their **logic** does not).
- MMKV (explicitly deferred behind the seam — not built now).
- Sync backend, OTA machinery, social/companion consumers.
- Any UI beyond what's needed to prove the scaffold builds and runs.

## Notes for /interview
Go through /interview before /deep-plan. The architecture is firm, but the **concrete SQLite schema, the migration-runner mechanics, and the exact repository-seam method surface** need codebase-level decisions. Specifically clarify: (1) table layout for materialized progress + the two event classes; (2) the exact transactional-wrapper API that enforces the milestone gate structurally; (3) the `settings` repository interface shape; (4) how the DB-schema migration runner and the `graphVersion` content-migration chain coexist as two independent axes. The truth-model, engine, and seam discipline are **locked — do not relitigate**; interview only the implementation shape.
