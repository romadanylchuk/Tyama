# Idea: Difficulty Model
_Created: 2026-06-15_
_Slug: difficulty-model_

## Description
The structure (`DifficultyParams`) that parameterizes generators and defines progression. v0.3 makes difficulty explicitly **three axes**: (1) **CPA representation level** — concrete → pictorial → abstract, where the "fruits instead of numbers" idea is the pictorial bridge to the abstract "x"; (2) **numeric range** — number magnitude, count of unknowns, negatives allowed, fruits vs letters; (3) **scaffolding fade / step elicitation** — how many solution steps are elicited, which decreases as mastery rises.

**Decided shape (Q2):** `DifficultyParams` is a **hybrid envelope** — a *universal* part carrying the two axes that every node already binds to (`representationLevel` and `elicitFromMastery`, both projections of the single `masteryLevel` scalar locked in [[mastery-gates]]) **plus an opaque, generator-specific numeric payload** (`params`) the deterministic core never inspects. The numeric-range axis (axis 2) is intrinsically per-generator, so it lives in the opaque payload; the cross-cutting axes (1 and 3) stay universal so the orchestrator can reason about difficulty generically. **Smooth progression** within one generator is a **monotone difficulty coordinate** (derived from `masteryLevel` along the CPA trajectory) mapped through **ordered per-node bands declared as config-as-data in the graph's `difficultyHooks`**; the generator only mechanically instantiates a band into concrete numbers. Band *values* are calibrated by the deferred pedagogy pass (shipped defaults unblock the build) — same owner as the mastery thresholds and the atom catalog.

## Priority
core

## Maturity
ready

## Notes
- Brief §4.1 (CPA), §5.3 (difficulty = function parameters), §5.4 (contract takes `DifficultyParams`), and the v0.3 scaffolding-fade section.
- **CPA axis:** every skill atom exists at three representation levels; the task model must carry representation level as a parameter.
- **Scaffolding-fade axis:** `elicitFromMastery` per step expresses the threshold at which a step stops being elicited — novice (full rail) → growing (key steps only) → mastered (`finalOnly` speed drill). One generator serves both the full rail and the bare final answer; only the count of elicited steps changes. Binds directly to [[mastery-gates]].
- **Q2 RESOLVED (2026-06-18 /decide):** `DifficultyParams` is a **hybrid envelope** — universal `representationLevel` + `elicitFromMastery` over an **opaque per-generator numeric `params` payload**. "Smooth" progression = a **monotone difficulty coordinate → ordered per-node bands in `difficultyHooks`** (config-as-data), instantiated mechanically by the generator.
- **~~Open thread (decided-not-ready)~~ → RESOLVED 2026-06-24:** the pedagogy-calibrated *band values* thread was **extracted to [[pedagogy-pass]]** (the structural "pedagogy-gate" ruling). The bands are calibration data in each node's `difficultyHooks`, not unresolved architecture; shipped defaults **are** the MVP spec, calibration is post-MVP refinement owned there. The *mechanism / shape* + defaults fully specify the node → now `ready`.
- Folded in here: CPA representation levels and scaffolding fade (both are named difficulty axes), per the merge decision at init.
- **Entry / starting difficulty is owned here (pedagogy), never by the theme** (triage R1 / locked decision #12). The starting point is an **output of diagnostic placement** during onboarding — see [[diagnostic-loop]] and [[presentation-theme]] (which owns color/type/motion/register/flavor only).

## Connections
_Mapped 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[diagnostic-loop]] — placement sets entry difficulty (#12)
- ← [[mastery-gates]] — rising mastery fades scaffolding (elicitFromMastery)
- ← [[pedagogy-pass]] — supplies the per-node ordered difficulty band values in `difficultyHooks` (replaces shipped defaults; config-as-data, off the critical path)

**Blocks (→):**
- → [[task-generation]] — DifficultyParams is the generator input
- → [[presentation-theme]] — entry point is a pedagogy output, NOT theme-owned (#12)

**Shared concerns:**
- [[mastery-gates]] — elicitFromMastery / scaffolding fade (one mechanism, three nodes)
- [[constrained-answer-entry]] — CPA representation level rendered as the widget

## Decision
_Decided: 2026-06-18_

### What Was Decided
**`DifficultyParams` is a hybrid envelope, and numeric progression is config-as-data bands.**

- **Universal envelope** — every generator receives, and the core reasons over, exactly the two cross-cutting axes that other nodes already bind to: `representationLevel` (concrete | pictorial | abstract) and `elicitFromMastery` (the scaffolding-fade cut-point). Both are projections of the single `masteryLevel` scalar locked in [[mastery-gates]] — not independent knobs.
- **Opaque per-generator payload** — the numeric-range axis (axis 2) is intrinsically generator-specific (sticks: `{count, bond}`; fraction: `{numer, denom, reducibility}`; fruit-equations: `{unknowns, range, negatives}`). It rides in a `params` field the deterministic core treats as **opaque** — only the owning generator interprets it. The shape is therefore *uniform at the envelope, free at the payload*.
- **Smooth progression = monotone coordinate → config-as-data bands.** A single monotone difficulty coordinate (derived from `masteryLevel` along the CPA trajectory) is mapped through **ordered per-node bands declared in the graph's `difficultyHooks`**. The generator's job is the mechanical `coord → params` instantiation; it does not own the curve. Band *values* are calibrated by the deferred pedagogy pass with **shipped defaults**, so the build is never blocked.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| Fully universal struct (one flat shape, all numeric knobs) | The numeric-range axis differs per generator (stick count vs denominator cap vs unknown count); a single shape becomes a bloated union or vague generics each generator reinterprets — uniformity in name only. |
| Fully per-generator params (no shared shape) | Breaks the single-contract uniformity that downstream nodes bind to and forces a bespoke `masteryLevel → difficulty` mapping per generator; the orchestrator can no longer reason about difficulty generically. |
| Imperative progression curve owned in generator code | Moves calibration into code (recalibration = code change + release) and diverges from the established pattern where thresholds and atom-catalog content live as deferred-pedagogy **data**. Config-as-data bands keep tuning out of the binary. |
| Entry/starting difficulty owned by theme/skin | Rejected at init (#12): entry point is a **pedagogy output** of diagnostic placement, never a cosmetic concern. Stays owned here. |

### Rationale
The split falls exactly along the seam the rest of the architecture already uses. The two universal axes are the ones [[mastery-gates]] already established as projections of one `masteryLevel` scalar and that [[constrained-answer-entry]] already renders — so they *must* be universal for the gate, the rail, and the rings to stay in agreement. The numeric-range axis is the one thing that genuinely varies per generator, so it is sealed in an opaque payload, mirroring the per-node `difficultyHooks` / per-node registry discipline. Sourcing progression from config-as-data bands is the direct consequence of locked decision #1 ("graph is data, never hardcoded") and keeps difficulty calibration in the same deferred pedagogy pass that owns mastery thresholds and the atom catalog — one calibration owner, shipped defaults to unblock the build.

### Implications
- **[[task-generation]]** (already `ready`) — its locked contract `generate(difficulty: DifficultyParams) → …` is **unchanged**: `DifficultyParams` now has a concrete shape (universal envelope + opaque `params`) but the signature and the per-step `elicitFromMastery` spec are untouched. No rework.
- **[[skill-graph]]** — `difficultyHooks` now carries **two** kinds of per-node config-as-data: mastery/speed thresholds (from [[mastery-gates]]) **and** the ordered difficulty bands defined here. Both are pedagogy-pass-calibrated with shipped defaults. (Worth noting in skill-graph's own session.)
- **[[mastery-gates]]** — supplies the `masteryLevel` scalar that yields both `elicitFromMastery` (universal axis) and the monotone difficulty coordinate (band selector). No change to its locked decision.
- **[[diagnostic-loop]]** — placement sets the **entry** difficulty coordinate (#12); this node owns the structure that coordinate parameterizes.
- **[[constrained-answer-entry]]** — renders the widget per the universal `representationLevel`; unaffected by the opaque numeric payload.

## History
- 2026-06-15 /architector:new — DifficultyParams as three axes (CPA representation, numeric range, scaffolding/elicitation). Merged the CPA-levels and scaffolding-fade nodes in here as axes. Universal-vs-per-generator structure and smooth-progression description are open.
- 2026-06-18 /architector:decide — chose **hybrid envelope** (universal `representationLevel` + `elicitFromMastery` over an opaque per-generator `params` payload) over fully-universal (bloated union) and fully-per-generator (breaks single-contract uniformity); chose **config-as-data difficulty bands in `difficultyHooks`** (monotone coordinate → bands, generator instantiates) over an imperative in-code curve, keeping calibration in the deferred pedagogy pass with shipped defaults. Q2 resolved; task-generation's locked contract needs no rework. → `decided` (NOT ready: pedagogy-calibrated band *values* deferred, parallel to mastery-gates/skill-graph).
- 2026-06-24 /architector:decide — `decided → ready`. The structural "pedagogy-gate" ruling **extracted the band-values thread to the new [[pedagogy-pass]] node** (calibration data in `difficultyHooks`, not unresolved architecture). Shipped defaults **are** the MVP spec; calibration is post-MVP refinement owned there. Mechanism/shape + defaults fully specify the node, so it is now `ready`. No change to the locked decision.
