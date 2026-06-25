# Idea: Skill Graph & Atom Catalog
_Created: 2026-06-15_
_Slug: skill-graph_

## Description
The pedagogical substrate: skills form a **directed acyclic graph (DAG) of dependencies** — not a line, not a tree — stored as **data/config, never hardcoded**. Graph nodes are **skill atoms** (e.g. number bonds, multiplication tables, equivalent fractions, fruit equations), not "task types." The DAG is what lets the diagnostic loop route precisely back to the *cause* (broken prerequisite) rather than the *symptom*.

**Decided model (2026-06-15):** the graph ships as a **bundled, read-only config asset** addressed by **human-readable slug IDs** (immutable after release), versioned by an in-asset semver **`graphVersion`** that drives the #15 split/merge/deprecate migration chain. Per-user progress references **node IDs only** — never a copy of a node. Each node = `{ id, prerequisites, representationLevels, difficultyHooks }`; **edges encode prerequisite dependencies only — never a recommended "next"/progression sequence.** The **mechanism is locked; the atom-catalog content is deferred to a dedicated pedagogy pass** (the 4-layer draft is a seed input, not the committed MVP graph). See `## Decision`.

## Decision
_Decided: 2026-06-15_

Decided in two clusters: **(A) graph data model — locked now**; **(B) atom-catalog content — explicitly deferred to a pedagogy pass.**

### What Was Decided

**Cluster A — Graph data model (locked):**
- **A1 · ID form = human-readable slug** (e.g. `equivalent-fractions`), not UUID. All three consumers — generator registration ([[task-generation]]), diagnostic routing ([[diagnostic-loop]]), and the human-authored #15 split/merge migration mapping — benefit from readable IDs in code, diagnostic logs, and migration tables. UUID's only edge (collision-free uncoordinated writes) is moot: the graph is a single-author shipped asset, so slug collisions surface at build time, not prod. **Discipline: a slug is immutable after release** — renaming = deprecate-old + add-new + migration mapping, never an edit (progress is keyed on the ID).
- **A2 · Config/state boundary (cornerstone)** — graph definition = bundled **read-only asset**; per-user progress references **node IDs only**, never a copy of the node. This is what makes graph edits cheap (structure changes don't touch user data) and is the concrete realization of the two-version-axes rule (asset and state move on different clocks).
- **A3 · Content versioning (resolves Q1)** — a semver-style **`graphVersion` carried in the asset**, orthogonal to the DB-schema version: Option C's DB version stamps *table shape*; `graphVersion` stamps *graph content*; they bump independently. It is not a label but a **migration key** — stored progress referencing a lower `graphVersion` triggers the #15 split/merge/deprecate mapping chain forward to current.
- **A4 · Loading strategy = static bundled asset behind an OTA-capable loader seam.** MVP loads the graph from the build; access goes through a thin `loadGraph() → GraphDefinition` seam so the source can later become OTA (Expo Updates) with no consumer rewrite. **Static now, loader-seam yes, OTA machinery no** — same seam discipline as ExplanationProvider and the scheduler. OTA's asset-trust/validation concerns stay out of MVP.
- **A5 · Node/edge schema = minimal, with explicit hook fields.** Node = `{ id (slug), prerequisites (ID[]), representationLevels (supported CPA levels — not every atom exists at all three, §4.1), difficultyHooks (params the generator reads) }`. Edges live on the **consumer node** as `prerequisites` — routing walks *backward* along prerequisites, so storing them on the dependent node is natural. **Constraint: edges are prerequisite dependencies ONLY — never a "next"/progression sequence.** "Where to send the user next" is a separate product decision (gamification/UI), not a graph edge property; folding it in would conflate objective prerequisite structure (diagnostics) with a progression choice.

**Cluster B — Atom-catalog content: lock mechanism, DEFER content.**
- The 4-layer draft catalog is **NOT committed** as the MVP graph. Choosing *which atoms, in what prerequisite order* is a **pedagogical claim about how math learning is structured** — not an engineering decision (the brief already marked the draft "to be agreed with pedagogy"). Ratifying it in an architecture session would bake an unvalidated pedagogical model into the substrate.
- **Decision: lock the mechanism (Cluster A); defer the content set to a dedicated pedagogy pass.** This blocks nobody — [[task-generation]], [[diagnostic-loop]], and [[gamification]] depend on the graph's **shape**, not its **content**, so deferring content unblocks none of them later than committing the draft would.
- **The pedagogy pass must deliver what the model requires** — atoms-as-nodes (not "topics"), prerequisite edges between them (where the real break hides two nodes back), and CPA levels per atom — not a topic list. The 4-layer draft is a **seed input** to that pass, not its output.
- **Dev-unblock hook:** ship a **tiny valid subgraph** (the fruit-equations branch already slated first in the build phases) as a fixture so task-generation and diagnostic-loop can build against real data — explicitly labelled **"smoke-test fixture, not the MVP catalog."**

### Alternatives Considered
| Option | Why not chosen |
|--------|----------------|
| UUID node IDs | Collision-free uncoordinated writes is its only edge, and that's moot for a single-author shipped asset (collisions surface at build time); readable IDs win in code, diagnostic logs, and the human-authored migration table |
| Store graph structure inline with progress | Every release editing the graph forces a user-data migration; violates the config/state boundary and the two-version-axes rule |
| Single version stamp for DB + graph | Conflates table shape with graph content — they migrate independently; a shared stamp forces spurious migrations |
| OTA graph loading in MVP | Pulls in asset trust/validation the MVP doesn't need; the loader seam preserves the option without the machinery |
| "next"/progression edges in the graph | Conflates objective prerequisite structure (for diagnostics) with a product progression decision (for UI); pollutes the diagnostic substrate |
| Commit the 4-layer draft catalog as the MVP graph | Silently ratifies an unvalidated pedagogical model in an architecture session; the draft is a seed, not a validated output — and committing it unblocks nothing that the labelled fixture + deferral doesn't |

### Rationale
Cluster A falls out of already-locked decisions (node identity #15, the two-version-axes rule, the offline single-author asset model) — it is mechanism, lockable now and cheap (a wide-fan-out hub). Cluster B is the honest call: the graph's value to its three consumers is its **shape**, fully specified by Cluster A; its **content** is a pedagogical artifact that must be *validated, not assumed*. Deferring content with a labelled smoke-test fixture keeps the build moving with zero hidden pedagogical debt baked into the substrate.

### Implications
- **Unblocks (on shape, now):** [[task-generation]] (registers generators against the slug ID scheme + reads `difficultyHooks`), [[diagnostic-loop]] (walks `prerequisites` backward — must NOT assume edges encode progression), [[gamification]] (renders mastery rings over node IDs; owns "next" separately from the graph).
- **`representationLevels` per node** is the carrier for CPA — consumed by [[difficulty-model]] and [[task-generation]].
- **The `graphVersion` migration chain** is the runtime consumer of the #15 split/merge/deprecate mapping owned by [[local-persistence]].
- **~~Open thread (why `decided`, not `ready`)~~ → RESOLVED 2026-06-24:** the atom-catalog **content** thread was **extracted to [[pedagogy-pass]]** (the structural "pedagogy-gate" ruling). Content is pedagogy data, not architecture; it fills the locked schema as a config-as-data swap via the `loadGraph()` seam. The **engine** is fully specified (mechanism + labelled smoke-test fixture) → this node is now `ready`; the authored catalog is [[pedagogy-pass]]'s deliverable.

## Priority
blocking

## Maturity
ready

## Notes
- Brief §5.1–5.2, locked decision #1 (graph as gamification core).
- Draft atom layers: **number sense** (subitizing/counting, number bonds, add/sub fluency, multiplication tables, division as inverse); **operation structure** (order of ops, properties, negatives); **fractions/parts/ratios** (part-whole, equivalent fractions & simplification, fraction ops, decimals↔fractions, percentages, ratios/proportions); **bridge to algebra** (unknown as missing number via fruits, single-variable equations, systems, substitution/elimination, expression simplification).
- Atom list is an explicit **starting draft, not final** — to be agreed with pedagogy. **RESOLVED via Cluster B (defer-to-pedagogy):** the 4-layer draft is a *seed input* to a dedicated pedagogy pass, NOT committed as the MVP graph; a labelled fruit-equations smoke-test fixture unblocks the build meanwhile.
- ~~Open (Q1): how to **version the graph schema** when adding nodes.~~ **RESOLVED (A3):** semver `graphVersion` carried in the asset, orthogonal to the DB-schema version, used as the #15 migration key.
- **Node identity (triage R4 / locked decision #15):** nodes carry **stable IDs** (never indices or display names), and the identity decision ships **with** an explicit **split/merge/deprecate mastery-migration mapping** — preservation-by-ID covers only additions. Migration mechanics live in [[local-persistence]] (now promoted to blocking).
- The graph must remain age-neutral: knows skills + difficulty only.

## Connections
_Mapped 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[local-persistence]] — node identity + split/merge/deprecate migration (#15) constrains graph evolution

**Depends on (←, deferred content):**
- ← [[pedagogy-pass]] — supplies the authored atom catalog (atoms-as-nodes + prerequisite edges + per-atom CPA levels) that replaces the smoke-test fixture; config-as-data swap, no engine change. Off the critical path.

**Blocks (→):**
- → [[task-generation]] — generators register against stable node IDs
- → [[diagnostic-loop]] — routing traverses the DAG prerequisite edges
- → [[gamification]] — the graph IS the visible mastery-ring surface

**Shared concern:**
- [[gamification]] — same DAG surface: pedagogical substrate (data) vs visible motivation map (presentation); kept separate deliberately (no merge)

_Wide-fan-out hub — cheap to lock (brief decision #1)._

## History
- 2026-06-15 /architector:new — DAG of skill dependencies as config; atom catalog drafted across 4 layers. Merged the graph mechanism and the atom content set into one node (tightly coupled). Schema versioning is open.
- 2026-06-15 /architector:decide — locked the graph DATA MODEL (slug IDs immutable-after-release; config/state boundary with progress keyed on IDs only; semver `graphVersion` in-asset as the #15 migration key, resolving Q1; static-asset-behind-an-OTA-loader-seam; minimal node schema with prerequisite-only edges — no progression edges) and DEFERRED the atom-catalog CONTENT to a dedicated pedagogy pass (4-layer draft = seed, not committed), shipping a labelled fruit-equations smoke-test fixture to keep the build moving. → `decided` (not `ready`: catalog content is the open pedagogy thread, parallel to local-persistence's open engine choice).
- 2026-06-24 /architector:decide — `decided → ready`. The structural "pedagogy-gate" ruling **extracted the atom-catalog content thread to the new [[pedagogy-pass]] node** (content is pedagogy data filling the locked schema as a config-as-data swap, not unresolved architecture). The graph **engine** is fully specified (mechanism + labelled smoke-test fixture), so it is now `ready`; the authored catalog is [[pedagogy-pass]]'s deliverable, off the critical path. Judgment accepted: a blocking node ships its engine on a fixture with the real catalog tracked downstream.
