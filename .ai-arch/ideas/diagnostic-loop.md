# Idea: Diagnostic Loop / Routing
_Created: 2026-06-15_
_Slug: diagnostic-loop_

## Description
The product's core differentiator: on error, the system does **not** serve "more of the same" — it identifies the **broken prerequisite** in the skill graph and **routes the user back there**. It turns a `failedStep` into a precise diagnosis of which foundational skill is missing. This is the "diagnose, don't just drill" thesis that the whole domain model exists to support.

**Decided model (2026-06-18):** routing is a **mastery-gated backward traversal over the skill-graph — no rules layer.** The entry point is the single `failedStep.skillNode` handed up by [[step-level-checking]] (first-break semantics). From there the algorithm descends along the graph's `prerequisites` edges into atoms the user has **not** mastered (`masteryLevel < masteryThreshold`), stopping at the **deepest unmastered prerequisite** (route there); if **all** prerequisites are mastered, the symptom atom itself is the target (a local gap/slip, not a missing foundation). Multiple unmastered prerequisites are disambiguated by **mastery rank** (descend toward the *lowest* `masteryLevel`), with a **single gentle probe** only on a tie or missing data. Routing is **pure graph + mastery-state traversal** — never a parallel rules table. Four edge constraints govern how the core behaves where it is most costly: staged (never teleporting) descent presentation, graded-scalar mastery reading, anti-loop short-horizon memory, and a strict read-not-write boundary on mastery state. See `## Decision`.

## Decision
_Decided: 2026-06-18_

### What Was Decided

**The Q4 routing algorithm: mastery-gated backward traversal over the skill-graph, no rules layer.**

- **Facet 1 — Routing target = mastery-gated backward traversal (B).** Entry = `failedStep.skillNode`. For each prerequisite, read the user's stored mastery; descend into *unmastered* prerequisites; stop at the **deepest unmastered atom** and route there. If every prerequisite is mastered, the symptom atom itself is the target (genuine local gap, not a missing foundation). This is the product thesis expressed as an algorithm — route to the *cause*, not the *symptom*.
- **Facet 2 — Mechanism = pure graph traversal, no rules layer (A).** The failed step already declares its `skillNode`; routing is traversal over the graph's `prerequisites` edges plus a mastery lookup. There is **no** separate failedStep→prerequisite rules table.
- **Facet 3 — Multi-prerequisite disambiguation = mastery rank, probe only on tie/no-data (A).** When the candidate atom has ≥2 unmastered prerequisites (the skill-graph caveat: two prerequisites = two distinct candidate causes, not "two steps back"), rank by stored `masteryLevel` and descend toward the lowest; serve a **single gentle probe task** only when ranking is genuinely ambiguous (tie or no data).

**Edge refinements (constraints on the core — it misbehaves at its most costly points without them):**

1. **Descent presentation is staged, never a teleport (anti-"abyss").** The deepest-unmastered *target* is unchanged, but the **transition is staged**: lead through intermediate nodes as a short sequence, or at minimum frame the move as "let's firm up the foundation under this" — never "you failed all the way back to here." A naive implementation that drops the learner four hops back in one jump reads as "you're hopeless, start from zero." This constrains *how* the transition is shown, not *where* it lands.
2. **"Mastered" is read against the graded scalar; descent prioritizes the weakest.** Per [[mastery-gates]], mastery is a graded `masteryLevel`, not boolean. "Unmastered prerequisite" = `masteryLevel < masteryThreshold` (never a false flag), and descent prioritizes the **lowest-`masteryLevel`** prerequisite — an untouched prereq is descended into more aggressively than a just-started (`in-progress`) one. Keeps traversal consistent with the graded mastery decision rather than a binary reading.
3. **Anti-loop short-horizon memory.** If a freshly-routed causal node fails *again*, do **not** re-pin it. Either the cause is deeper (descend further) or a different modality/explanation is needed (escalate to [[explanation-provider]]) — never the same identical approach twice. Traversal carries short-horizon memory ("already sent here → on repeat break, change strategy"). Without this, the most vulnerable user gets the most looping, punishing experience.
4. **Routing reads mastery, never writes it.** Diagnostic routing decides only "where to send *now* after an error." It **does not mutate** the target node's mastery — mastery changes are the consequence of subsequent attempts via [[mastery-gates]] (and band shifts via [[spaced-repetition]]), never a side effect of routing. Merging these would let routing silently rewrite mastery state and destroy its single source of truth. **Routing reads mastery; never writes.**

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| **F1·A** — route to `failedStep.skillNode` directly | Drills the *symptom*; contradicts the core thesis ("the real break hides two nodes back"). |
| **F1·C** — probe prerequisites on every error | Adds a diagnostic task to *every* error — friction on an already-charged moment for an anxious learner. |
| **F2·B** — separate rules table (failedStep→prereq) | Duplicates the graph's prerequisite edges → a second source of truth that drifts; the cured disease. The graph is already the prerequisite substrate. |
| **F3·B** — always probe each candidate prerequisite | Precise but heavy friction; mastery rank already disambiguates in the common case. |
| **F3·C** — route through all candidates sequentially | Reads as punishment ("now do all of this"). |
| **F3·D** — ask the user which prerequisite | Pushes diagnosis onto the anxious learner — directly off-thesis. |

### Rationale
Every facet is risk-profiled for an anxious learner and for keeping single sources of truth intact. Backward traversal *is* "diagnose the cause, not the symptom." Pure graph traversal keeps the graph as the one prerequisite authority (a rules table would fork it). Mastery-rank disambiguation resolves the skill-graph "two candidate causes" caveat without per-error friction. The four edge constraints address the places where a correct-on-paper algorithm turns destructive in delivery: a right target shown as a teleport shames; a binary read of a graded scalar mis-descends; memoryless re-routing loops the most vulnerable user; and write-capable routing would dissolve the read/write boundary that keeps mastery state coherent across [[mastery-gates]] and [[spaced-repetition]]. The algorithm consumes the single, unambiguous first-break `failedStep` from [[step-level-checking]] as-is.

### Implications
- **[[step-level-checking]]** — consumed as-is: its single first-break `failedStep.skillNode` is the traversal entry point. No change requested upstream.
- **[[skill-graph]]** — traversal walks `prerequisites` backward and honors the locked caveat (prerequisites are candidate causes, not a progression sequence; ≥2 prerequisites = ≥2 distinct causes). No new edge semantics required.
- **[[mastery-gates]]** — routing **reads** `masteryLevel`/`masteryThreshold` and the `in-progress` band to gate descent and rank candidates; it **never writes** them. The graded scalar is the contract; a boolean reading is wrong.
- **[[spaced-repetition]]** — the read-not-write boundary extends here: routing does not perform band demotion; SR owns within-node band shifts, routing owns cross-node "where now." Failed reviews still reroute *through* this traversal.
- **[[explanation-provider]]** — the anti-loop escalation target: on a repeat break at a freshly-routed node, traversal may escalate to a different modality/explanation rather than re-pinning. The escalation seam is referenced, not redefined here.
- **[[difficulty-model]]** — diagnostic placement still sets entry difficulty (#12); unchanged by this decision.
- **Presentation/UX** — the staged-descent (anti-abyss) requirement is a constraint on whatever surface renders the routing transition; the target node is fixed by the algorithm, the framing is owned by presentation.

## Priority
core

## Maturity
ready

## Notes
- Brief §1 (core thesis), §4.4, §5.1.
- ~~Open (Q4): how exactly to get from `failedStep` → prerequisite node — a direct step→skill mapping, or a separate rules layer?~~ **RESOLVED (2026-06-18):** mastery-gated backward graph traversal, no rules layer (Facet 2 = pure graph). See `## Decision`.
- Depends on the precision of [[step-level-checking]] (you can only route as well as you can localize the error) and the dependency edges in [[skill-graph]].
- An error is a routing signal, not a loss event (no-punishment constraint) — operationalized by edge refinements 1 (staged descent) and 3 (anti-loop).

## Connections
_Mapped 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[step-level-checking]] — consumes `failedStep` (you can only route as precisely as the error is localized)
- ← [[skill-graph]] — traverses the DAG prerequisite edges
  - _Dependency satisfied (skill-graph A5, /decide 2026-06-15): walk `prerequisites` backward. **CAVEAT** — edges are prerequisite dependencies, NOT a progression sequence. A node with two prerequisites means two distinct candidate causes, not "two steps back." Do not collapse routing into linear step-back._
- ← [[mastery-gates]] — reads the graded `masteryLevel`/`masteryThreshold` to gate descent and rank candidates (read-only; refinements 2 & 4)

**Blocks (→):**
- → [[difficulty-model]] — diagnostic placement sets entry difficulty (#12)
- → [[spaced-repetition]] — failed reviews route back / reschedule (routing reads, SR owns band demotion — refinement 4)

**Shared concerns:**
- [[explanation-provider]] — anti-loop escalation target on repeat break (refinement 3)
- presentation/UX — owns the staged-descent framing of the routing transition (refinement 1)

## History
- 2026-06-15 /architector:new — failedStep → broken-prerequisite routing; the most valuable part of the product per the brief. Routing algorithm (direct mapping vs rules layer) is the key open question.
- 2026-06-18 /architector:decide — **resolved Q4**: routing = **mastery-gated backward graph traversal, no rules layer** (F1·B target = deepest unmastered prerequisite, else symptom atom; F2·A pure graph + mastery lookup, never a rules table; F3·A disambiguate by mastery rank, single gentle probe only on tie/no-data). Locked four edge constraints: (1) staged descent presentation, never a teleport (anti-abyss); (2) "unmastered" read against the graded `masteryLevel < masteryThreshold`, descend toward the weakest; (3) anti-loop short-horizon memory — on repeat break, descend further or escalate to [[explanation-provider]], never re-pin; (4) routing **reads** mastery, **never writes** it (boundary with mastery-gates/spaced-repetition). No open questions remain → `ready`.
